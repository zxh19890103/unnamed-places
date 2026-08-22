import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";

import { BASE_URL } from "../../calc/constants";

type TilesBytesResponse = {
  ok: boolean;
  bytes: number;
  updatedAt: string | null;
};

function formatBytes(bytes: number | null) {
  if (bytes === null) {
    return "--";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`;
  }

  const mib = kib / 1024;
  if (mib < 1024) {
    return `${mib.toFixed(1)} MiB`;
  }

  const gib = mib / 1024;
  return `${gib.toFixed(2)} GiB`;
}

export function TilesBytes() {
  const [bytes, setBytes] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBytes = useCallback(async (forceRecompute: boolean) => {
    setIsBusy(true);
    setError(null);

    try {
      const endpoint = forceRecompute
        ? `${BASE_URL}/stats/tiles/bytes/recompute`
        : `${BASE_URL}/stats/tiles/bytes`;
      const response = await fetch(endpoint, {
        method: forceRecompute ? "POST" : "GET",
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as TilesBytesResponse;
      setBytes(payload.bytes);
      setUpdatedAt(payload.updatedAt ?? null);
    } catch (_error) {
      setError("unavailable");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadBytes(false);
  }, [loadBytes]);

  return (
    <div className="rounded-lg border border-jade-border-soft bg-jade-depth/45 p-3">
      <div className="text-[11px] font-medium uppercase tracking-normal text-jade-text-muted">
        Tiles cache size
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={clsx(
            "min-w-0 text-sm font-medium tabular-nums text-jade-text",
            error && "text-jade-error",
          )}
        >
          {error ? error : formatBytes(bytes)}
        </span>
        <button
          type="button"
          disabled={isBusy}
          aria-busy={isBusy}
          onClick={() => {
            void loadBytes(true);
          }}
          className="rounded-lg border border-jade-border-soft bg-jade-control px-2.5 py-1 text-[11px] font-medium text-jade-text transition-colors hover:bg-jade-control-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? "..." : "Recompute"}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-jade-text-muted">
        {updatedAt
          ? `Updated ${new Date(updatedAt).toLocaleTimeString()}`
          : "Not loaded"}
      </div>
    </div>
  );
}
