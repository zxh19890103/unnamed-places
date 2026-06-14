import { describe, expect, test } from "vitest";

import { createSatelliteRequestBudget } from "../src/view/satellite-request-budget";

describe("createSatelliteRequestBudget", () => {
  test("dequeues the closer tile first", () => {
    const budget = createSatelliteRequestBudget(4, 4);

    budget.enqueue({
      tileId: "11/2/3",
      distance: 40_000,
      targetZoom: 14,
      generation: 1,
    });
    budget.enqueue({
      tileId: "11/2/4",
      distance: 20_000,
      targetZoom: 14,
      generation: 1,
    });

    budget.startFrame();

    expect(budget.takeNext()).toEqual({
      tileId: "11/2/4",
      distance: 20_000,
      targetZoom: 14,
      generation: 1,
    });
    expect(budget.takeNext()).toEqual({
      tileId: "11/2/3",
      distance: 40_000,
      targetZoom: 14,
      generation: 1,
    });
  });

  test("enforces the per-frame and concurrent caps", () => {
    const budget = createSatelliteRequestBudget(1, 1);

    budget.enqueue({
      tileId: "11/2/3",
      distance: 10_000,
      targetZoom: 15,
      generation: 1,
    });
    budget.enqueue({
      tileId: "11/2/4",
      distance: 11_000,
      targetZoom: 15,
      generation: 1,
    });

    budget.startFrame();

    const first = budget.takeNext();
    expect(first?.tileId).toBe("11/2/3");
    expect(budget.takeNext()).toBeUndefined();

    budget.complete(first!);

    budget.startFrame();

    const second = budget.takeNext();
    expect(second?.tileId).toBe("11/2/4");
    expect(budget.takeNext()).toBeUndefined();
  });

  test("ignores stale queued work after a newer generation is enqueued", () => {
    const budget = createSatelliteRequestBudget(4, 4);

    budget.enqueue({
      tileId: "11/2/3",
      distance: 40_000,
      targetZoom: 13,
      generation: 1,
    });
    budget.enqueue({
      tileId: "11/2/3",
      distance: 18_000,
      targetZoom: 15,
      generation: 2,
    });

    budget.startFrame();

    expect(budget.takeNext()).toEqual({
      tileId: "11/2/3",
      distance: 18_000,
      targetZoom: 15,
      generation: 2,
    });
    expect(budget.takeNext()).toBeUndefined();
  });
});