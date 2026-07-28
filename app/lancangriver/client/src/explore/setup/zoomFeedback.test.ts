import { describe, expect, it } from "vitest";
import { computeZoomFeedback, getZoomFeedbackLabel } from "./zoomFeedback";

describe("zoom feedback", () => {
  it("rises when the camera distance changes quickly", () => {
    const feedback = computeZoomFeedback({
      previousDistance: 10_000,
      currentDistance: 14_500,
      previousFeedback: 0.1,
    });

    expect(feedback).toBeGreaterThan(0.1);
    expect(feedback).toBeLessThanOrEqual(1);
  });

  it("decays toward idle when movement settles", () => {
    const feedback = computeZoomFeedback({
      previousDistance: 14_500,
      currentDistance: 14_510,
      previousFeedback: 0.7,
    });

    expect(feedback).toBeLessThan(0.7);
    expect(feedback).toBeGreaterThanOrEqual(0);
  });

  it("maps feedback levels to user-facing labels", () => {
    expect(getZoomFeedbackLabel(0.05)).toBe("Exploring");
    expect(getZoomFeedbackLabel(0.35)).toBe("Zooming");
    expect(getZoomFeedbackLabel(0.75)).toBe("Focused");
  });
});
