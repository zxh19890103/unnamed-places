import type { TileKey } from "./request-scheduler";

export type TileHandle = {
  dispose: () => void;
};

export type TileLoader = (tile: TileKey) => Promise<TileHandle>;

export type TileViewportSnapshot = {
  desiredCount: number;
  loadedCount: number;
  pendingCount: number;
  failedCount: number;
  loadedIds: string[];
};

type TileStatus = "pending" | "loaded" | "failed";

type TileEntry = {
  tile: TileKey;
  status: TileStatus;
  handle?: TileHandle;
  error?: unknown;
  evicted: boolean;
};

export type TileViewportUpdate = {
  desiredCount: number;
  loadedCount: number;
  pendingCount: number;
  failedCount: number;
  loadedIds: string[];
};

export function tileKeyToId(tile: TileKey): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function createTileViewportController(loadTile: TileLoader) {
  const entries = new Map<string, TileEntry>();
  let desiredIds = new Set<string>();

  function getSnapshot(): TileViewportSnapshot {
    const loadedIds = Array.from(entries.entries())
      .filter(([, entry]) => entry.status === "loaded")
      .map(([tileId]) => tileId)
      .sort();

    let pendingCount = 0;
    let failedCount = 0;
    for (const entry of entries.values()) {
      if (entry.status === "pending") {
        pendingCount += 1;
      }
      if (entry.status === "failed") {
        failedCount += 1;
      }
    }

    return {
      desiredCount: desiredIds.size,
      loadedCount: loadedIds.length,
      pendingCount,
      failedCount,
      loadedIds,
    };
  }

  function disposeEntry(entry: TileEntry) {
    entry.evicted = true;
    if (entry.handle) {
      entry.handle.dispose();
    }
  }

  function sync(nextTiles: TileKey[]) {
    const nextDesiredIds = new Set(nextTiles.map(tileKeyToId));
    desiredIds = nextDesiredIds;

    for (const [tileId, entry] of entries.entries()) {
      if (!nextDesiredIds.has(tileId)) {
        disposeEntry(entry);
        entries.delete(tileId);
      }
    }

    for (const tile of nextTiles) {
      const tileId = tileKeyToId(tile);
      if (entries.has(tileId)) {
        continue;
      }

      const entry: TileEntry = {
        tile,
        status: "pending",
        evicted: false,
      };
      entries.set(tileId, entry);

      void loadTile(tile)
        .then((handle) => {
          if (entry.evicted || !desiredIds.has(tileId)) {
            handle.dispose();
            entries.delete(tileId);
            return;
          }

          entry.handle = handle;
          entry.status = "loaded";
        })
        .catch((error: unknown) => {
          entry.error = error;
          entry.status = "failed";
          entries.delete(tileId);
        });
    }
  }

  function clear() {
    desiredIds = new Set();
    for (const entry of entries.values()) {
      disposeEntry(entry);
    }
    entries.clear();
  }

  return {
    sync,
    clear,
    getSnapshot,
    update(): TileViewportUpdate {
      return getSnapshot();
    },
  };
}
