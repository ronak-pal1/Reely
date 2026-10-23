export function formatTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, fps);
  const totalSeconds = Math.max(0, Math.floor(frame / safeFps));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function snapValue(value: number, points: number[], threshold: number): number {
  if (threshold <= 0) return value;
  let best = value;
  let distance = threshold;
  for (const point of points) {
    const delta = Math.abs(point - value);
    if (delta <= distance) {
      best = point;
      distance = delta;
    }
  }
  return best;
}
