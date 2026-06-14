export type DiagnosticsSnapshot = {
  vectorCount: number;
  demStatus: "ok" | "na";
  satelliteStatus: "ok" | "na";
  tileCount: number;
  pendingCount: number;
  failedCount: number;
  lastError: string;
  manifestSize?: number;
  manifestHits?: number;
  manifestMisses?: number;
  sampleHit?: string;
  sampleMiss?: string;
};

export function renderDiagnostics(snapshot: DiagnosticsSnapshot): string {
  const parts = [
    `vector=${snapshot.vectorCount}`,
    `dem=${snapshot.demStatus}`,
    `sat=${snapshot.satelliteStatus}`,
    `tiles=${snapshot.tileCount}`,
    `pending=${snapshot.pendingCount}`,
    `failed=${snapshot.failedCount}`,
    `error=${snapshot.lastError || "none"}`,
  ];

  if (typeof snapshot.manifestSize === "number") {
    parts.push(`manifestSize=${snapshot.manifestSize}`);
  }
  if (typeof snapshot.manifestHits === "number") {
    parts.push(`manifestHits=${snapshot.manifestHits}`);
  }
  if (typeof snapshot.manifestMisses === "number") {
    parts.push(`manifestMisses=${snapshot.manifestMisses}`);
  }
  if (snapshot.sampleHit) {
    parts.push(`hit=${snapshot.sampleHit}`);
  }
  if (snapshot.sampleMiss) {
    parts.push(`miss=${snapshot.sampleMiss}`);
  }

  return parts.join(" ");
}
