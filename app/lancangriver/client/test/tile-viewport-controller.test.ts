import { describe, expect, it, vi } from "vitest";
import {
  createTileViewportController,
  tileKeyToId,
} from "../src/view/tile-viewport-controller";

const tileA = { z: 11, x: 100, y: 200 };
const tileB = { z: 11, x: 101, y: 200 };

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("createTileViewportController", () => {
  it("loads tiles once and disposes removed tiles", async () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const loadTile = vi.fn(async (tile) => ({
      dispose: tile.x === tileA.x ? disposeA : disposeB,
    }));
    const controller = createTileViewportController(loadTile);

    controller.sync([tileA, tileB]);
    await flushMicrotasks();

    expect(loadTile).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().loadedIds).toEqual([
      tileKeyToId(tileA),
      tileKeyToId(tileB),
    ]);

    controller.sync([tileB]);
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).not.toHaveBeenCalled();
  });

  it("disposes a tile after it finishes loading if it was evicted", async () => {
    let resolveLoad: (handle: { dispose: () => void }) => void = () => {
      throw new Error("expected load resolver to be captured");
    };
    const dispose = vi.fn();
    const loadTile = vi.fn(
      () =>
        new Promise<{ dispose: () => void }>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const controller = createTileViewportController(loadTile);

    controller.sync([tileA]);
    controller.sync([]);

    resolveLoad({ dispose });
    await flushMicrotasks();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().loadedIds).toEqual([]);
  });
});
