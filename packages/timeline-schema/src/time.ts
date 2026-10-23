import type { Clip, EasingName, Keyframe, Transform } from "./schema.js";

export function applyEasing(kind: EasingName, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (kind === "easeIn") return clamped * clamped;
  if (kind === "easeOut") return 1 - (1 - clamped) * (1 - clamped);
  if (kind === "easeInOut") {
    return clamped < 0.5 ? 2 * clamped * clamped : 1 - ((-2 * clamped + 2) ** 2) / 2;
  }
  return clamped;
}

export function sampleKeyframes(
  base: number,
  keys: Keyframe[] | undefined,
  frame: number,
): number {
  if (!keys || keys.length === 0) return base;
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  const first = sorted[0];
  if (!first) return base;
  if (frame <= first.frame) return first.value;
  const last = sorted[sorted.length - 1];
  if (!last) return base;
  if (frame >= last.frame) return last.value;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (!left || !right) continue;
    if (frame >= left.frame && frame <= right.frame) {
      const span = right.frame - left.frame || 1;
      const t = applyEasing(left.easing, (frame - left.frame) / span);
      return left.value + (right.value - left.value) * t;
    }
  }
  return base;
}

export function resolveTransform(clip: Clip, localFrame: number): Transform {
  return {
    x: sampleKeyframes(clip.transform.x, clip.keyframes.x, localFrame),
    y: sampleKeyframes(clip.transform.y, clip.keyframes.y, localFrame),
    scale: sampleKeyframes(clip.transform.scale, clip.keyframes.scale, localFrame),
    rotate: sampleKeyframes(clip.transform.rotate, clip.keyframes.rotate, localFrame),
    opacity: sampleKeyframes(clip.transform.opacity, clip.keyframes.opacity, localFrame),
  };
}

export function resolveVolume(clip: Clip, localFrame: number): number {
  const base = sampleKeyframes(clip.volume, clip.keyframes.volume, localFrame);
  let envelope = 1;
  if (clip.fadeInFrames > 0 && localFrame < clip.fadeInFrames) {
    envelope = localFrame / clip.fadeInFrames;
  }
  if (clip.fadeOutFrames > 0 && localFrame > clip.durationInFrames - clip.fadeOutFrames) {
    const remaining = clip.durationInFrames - localFrame;
    envelope = Math.min(envelope, remaining / clip.fadeOutFrames);
  }
  return Math.max(0, base * envelope);
}
