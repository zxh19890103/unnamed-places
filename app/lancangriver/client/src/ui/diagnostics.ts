export type DiagnosticsSnapshot = {
  vectorCount: number;
  demStatus: "ok" | "na";
  satelliteStatus: "ok" | "na";
  tileCount: number;
  pendingCount: number;
  failedCount: number;
  lastError: string;
};

export function renderDiagnostics(snapshot: DiagnosticsSnapshot): string {
  return [
    `vector=${snapshot.vectorCount}`,
    `dem=${snapshot.demStatus}`,
    `sat=${snapshot.satelliteStatus}`,
    `tiles=${snapshot.tileCount}`,
    `pending=${snapshot.pendingCount}`,
    `failed=${snapshot.failedCount}`,
    `error=${snapshot.lastError || "none"}`,
  ].join(" ");
}
