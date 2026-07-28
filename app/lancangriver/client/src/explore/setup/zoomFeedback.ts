export type ZoomFeedbackState = {
  intensity: number;
  label: string;
};

export function computeZoomFeedback({
  previousDistance,
  currentDistance,
  previousFeedback,
}: {
  previousDistance: number;
  currentDistance: number;
  previousFeedback: number;
}): number {
  const delta = Math.abs(currentDistance - previousDistance);
  const movement = Math.min(delta / 5000, 1);
  const nextIntensity = Math.max(0, previousFeedback * 0.72 + movement * 0.28);

  if (movement < 0.01) {
    return Math.max(0, previousFeedback * 0.8 - 0.02);
  }

  return Math.min(1, nextIntensity);
}

export function getZoomFeedbackLabel(intensity: number): string {
  if (intensity >= 0.65) {
    return "Focused";
  }

  if (intensity >= 0.25) {
    return "Zooming";
  }

  return "Exploring";
}
