import { useCallback, useEffect, useState } from "react";

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
    <div>
      <div style={{ opacity: 0.68 }}>Tiles cache size</div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}
      >
        <span>{error ? error : formatBytes(bytes)}</span>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void loadBytes(true);
          }}
          style={{
            pointerEvents: "auto",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 8,
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            fontSize: 11,
            padding: "2px 8px",
            cursor: isBusy ? "default" : "pointer",
          }}
        >
          {isBusy ? "..." : "Recompute"}
        </button>
      </div>
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
        {updatedAt
          ? `Updated ${new Date(updatedAt).toLocaleTimeString()}`
          : "Not loaded"}
      </div>
    </div>
  );
}
