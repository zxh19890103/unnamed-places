import { describe, expect, test } from "vitest";

import { renderDiagnostics } from "../src/ui/diagnostics";

describe("renderDiagnostics", () => {
  test("includes satellite pending count and zoom distribution", () => {
    expect(
      renderDiagnostics({
        vectorCount: 0,
        demStatus: "ok",
        satelliteStatus: "ok",
        tileCount: 12,
        pendingCount: 3,
        satellitePendingCount: 5,
        failedCount: 1,
        lastError: "none",
        satelliteZoomDistribution: "z11:4,z13:8",
      }),
    ).toBe(
      "vector=0 dem=ok sat=ok tiles=12 pending=3 satPending=5 failed=1 error=none lod=z11:4,z13:8",
    );
  });
});
