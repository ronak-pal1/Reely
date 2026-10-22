import type { CSSProperties } from "react";
import type { Effect } from "@reelio/timeline-schema";

const LUT_FILTERS: Record<string, string> = {
  none: "none",
  warm: "sepia(0.28) saturate(1.35) contrast(1.05)",
  cool: "saturate(0.9) hue-rotate(18deg) contrast(1.04)",
  bw: "grayscale(1) contrast(1.08)",
  vivid: "saturate(1.65) contrast(1.08)",
  teal: "sepia(0.2) hue-rotate(150deg) saturate(1.45) contrast(1.05)",
  film: "contrast(1.12) saturate(0.82) sepia(0.18)",
};

export function effectFilter(effects: Effect[], frame: number): CSSProperties {
  const filters: string[] = [];
  const transforms: string[] = [];
  let extra: CSSProperties = {};
  for (const effect of effects) {
    const amount = effect.intensity;
    if (effect.type === "blur") filters.push(`blur(${(amount * 12).toFixed(2)}px)`);
    if (effect.type === "lut") {
      const name = typeof effect.props?.lut === "string" ? effect.props.lut : "vivid";
      const filter = LUT_FILTERS[name] ?? LUT_FILTERS.vivid;
      if (filter && filter !== "none") filters.push(filter);
    }
    if (effect.type === "fisheye") {
      transforms.push(`scale(${(1 + amount * 0.18).toFixed(3)})`);
      extra = { ...extra, borderRadius: `${Math.round(amount * 18)}%`, overflow: "hidden" };
    }
    if (effect.type === "glitch") {
      const shift = Math.sin(frame * 1.8) * amount * 18;
      transforms.push(`translateX(${shift.toFixed(2)}px)`);
      filters.push(`hue-rotate(${Math.sin(frame) * amount * 25}deg)`);
    }
    if (effect.type === "shake") {
      const x = Math.sin(frame * 2.2) * amount * 14;
      const y = Math.cos(frame * 2.7) * amount * 10;
      transforms.push(`translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`);
    }
    if (effect.type === "zoomPunch") {
      const life = Math.max(0, 1 - frame / 8);
      transforms.push(`scale(${(1 + amount * 0.28 * life).toFixed(3)})`);
    }
  }
  return {
    ...extra,
    filter: filters.length > 0 ? filters.join(" ") : undefined,
    transform: transforms.length > 0 ? transforms.join(" ") : undefined,
  };
}

export function Grain({ intensity }: { intensity: number }) {
  if (intensity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: 0.18 + intensity * 0.45,
        mixBlendMode: "overlay",
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.85'/></svg>\")",
        backgroundSize: "180px 180px",
      }}
    />
  );
}

export function Vignette({ intensity }: { intensity: number }) {
  if (intensity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        boxShadow: `inset 0 0 ${80 + intensity * 180}px rgba(0,0,0,${0.25 + intensity * 0.55})`,
      }}
    />
  );
}
