import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  resolveTransform,
  resolveVolume,
  type Clip,
  type Project,
  type Track,
} from "@reelio/timeline-schema";
import { Grain, Vignette, effectFilter } from "./effects";

export type ReelCompositionProps = {
  project: Project;
  watermark?: boolean;
};

function mediaStart(clip: Clip): number {
  return Math.max(0, Math.round(clip.trimStart));
}

function ClipBody({ clip, track }: { clip: Clip; track: Track }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const transform = resolveTransform(clip, frame);
  const volume = track.muted ? 0 : resolveVolume(clip, frame);
  const filterStyle = effectFilter(clip.effects, frame);
  const grain = clip.effects.find((effect) => effect.type === "grain");
  const vignette = clip.effects.find((effect) => effect.type === "vignette");
  const enter = transitionOpacity(clip, frame, "in");
  const exit = transitionOpacity(clip, frame, "out");
  const slide = transitionOffset(clip, frame);

  return (
    <AbsoluteFill
      style={{
        opacity: transform.opacity * enter * exit,
        transform: `translate(${slide.x}px, ${slide.y}px) scale(${slide.scale})`,
      }}
    >
      <AbsoluteFill style={filterStyle}>
        {track.type === "video" ? (
          clip.src ? (
            <OffthreadVideo
              src={clip.src}
              startFrom={mediaStart(clip)}
              playbackRate={clip.speed}
              volume={volume}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <AbsoluteFill style={{ background: clip.props.backgroundColor ?? "#111111" }} />
          )
        ) : null}
        {track.type === "audio" && clip.src ? (
          <Audio src={clip.src} startFrom={mediaStart(clip)} playbackRate={clip.speed} volume={volume} />
        ) : null}
        {track.type === "sticker" ? <Sticker clip={clip} transform={transform} /> : null}
        {track.type === "text" || track.type === "caption" ? (
          <TextLayer clip={clip} frame={frame} fps={fps} transform={transform} />
        ) : null}
        {grain ? <Grain intensity={grain.intensity} /> : null}
        {vignette ? <Vignette intensity={vignette.intensity} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function transitionOpacity(clip: Clip, frame: number, edge: "in" | "out"): number {
  const transition = edge === "in" ? clip.transitionIn : clip.transitionOut;
  if (!transition || transition.type === "none" || transition.durationInFrames <= 0) return 1;
  if (transition.type !== "fade" && transition.type !== "whip" && transition.type !== "zoom") {
    return 1;
  }
  if (edge === "in") {
    return interpolate(frame, [0, transition.durationInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.ease,
    });
  }
  const start = clip.durationInFrames - transition.durationInFrames;
  return interpolate(frame, [start, clip.durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function transitionOffset(clip: Clip, frame: number): { x: number; y: number; scale: number } {
  const transition = clip.transitionIn;
  if (!transition || transition.durationInFrames <= 0 || frame > transition.durationInFrames) {
    return { x: 0, y: 0, scale: 1 };
  }
  const t = interpolate(frame, [0, transition.durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  if (transition.type === "slide" || transition.type === "whip") {
    const distance = transition.type === "whip" ? 280 : 120;
    const signed = distance * t;
    const direction = transition.direction ?? "left";
    return {
      x: direction === "left" ? -signed : direction === "right" ? signed : 0,
      y: direction === "up" ? -signed : direction === "down" ? signed : 0,
      scale: transition.type === "whip" ? 1 + t * 0.08 : 1,
    };
  }
  if (transition.type === "zoom") return { x: 0, y: 0, scale: 1 + t * 0.25 };
  return { x: 0, y: 0, scale: 1 };
}

function animationScale(clip: Clip, frame: number): number {
  const animation = clip.props.animation ?? "none";
  if (animation === "pop" || animation === "popIn") {
    return interpolate(frame, [0, 8], [0.72, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.back(1.4)),
    });
  }
  return 1;
}

function animationOpacity(clip: Clip, frame: number): number {
  const animation = clip.props.animation ?? "none";
  if (animation === "fade" || animation === "wipe" || animation === "slide") {
    return interpolate(frame, [0, 8], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  return 1;
}

function TextLayer({
  clip,
  frame,
  fps,
  transform,
}: {
  clip: Clip;
  frame: number;
  fps: number;
  transform: { x: number; y: number; scale: number; rotate: number; opacity: number };
}) {
  const props = clip.props;
  const styleName = props.captionStyle;
  const words = props.words ?? [];
  const ms = (frame / fps) * 1000;
  const active = words.findIndex((word) => ms >= word.startMs && ms < word.endMs);
  const pop = animationScale(clip, frame);
  const base: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "86%",
    transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale * pop}) rotate(${transform.rotate}deg)`,
    opacity: animationOpacity(clip, frame),
    textAlign: props.align ?? "center",
    color: props.color ?? "#FFFFFF",
    fontFamily: `${props.fontFamily ?? "Inter"}, Inter, sans-serif`,
    fontWeight: props.fontWeight ?? (styleName === "minimal" ? 500 : 700),
    fontSize: props.fontSize ?? (styleName === "minimal" ? 42 : 64),
    letterSpacing: props.letterSpacing ?? (styleName === "hormozi" ? 1 : 0),
    lineHeight: props.lineHeight ?? 1.05,
    textTransform: styleName === "hormozi" ? "uppercase" : undefined,
    WebkitTextStroke: styleName === "outline" || styleName === "classic" ? "2px #000" : undefined,
    textShadow:
      styleName === "bold" || styleName === "hormozi" ? "0 8px 24px rgba(0,0,0,0.45)" : undefined,
    background:
      styleName === "gradient"
        ? "linear-gradient(90deg, #ffffff, #c4b5fd)"
        : styleName === "boxed"
          ? "rgba(0,0,0,0.72)"
          : undefined,
    WebkitBackgroundClip: styleName === "gradient" ? "text" : undefined,
    WebkitTextFillColor: styleName === "gradient" ? "transparent" : undefined,
    borderRadius: styleName === "boxed" ? 18 : undefined,
    padding: styleName === "boxed" ? "10px 18px" : undefined,
    display: "inline-block",
  };

  if (words.length > 0 && (styleName === "karaoke" || styleName === "wordHighlight" || styleName === "hormozi" || styleName === "popIn")) {
    return (
      <div style={base}>
        {words.map((word, index) => {
          const on = index === active;
          return (
            <span
              key={`${word.text}-${word.startMs}`}
              style={{
                marginRight: 10,
                color: styleName === "wordHighlight" && on ? "#FFFFFF" : on ? "#C4B5FD" : (props.color ?? "#FFFFFF"),
                background: styleName === "wordHighlight" && on ? "#7C5CFF" : "transparent",
                borderRadius: 10,
                padding: styleName === "wordHighlight" ? "0 8px" : undefined,
                display: "inline-block",
                transform: styleName === "popIn" && on ? "scale(1.08)" : undefined,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    );
  }

  return <div style={base}>{props.text ?? ""}</div>;
}

function Sticker({
  clip,
  transform,
}: {
  clip: Clip;
  transform: { x: number; y: number; scale: number; rotate: number };
}) {
  const content = clip.props.imageSrc ? (
    <Img src={clip.props.imageSrc} style={{ width: 180, height: 180, objectFit: "contain" }} />
  ) : (
    <div style={{ fontSize: 120, lineHeight: 1 }}>{clip.props.sticker ?? "✦"}</div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale}) rotate(${transform.rotate}deg)`,
      }}
    >
      {content}
    </div>
  );
}

export const ReelComposition: React.FC<ReelCompositionProps> = ({ project, watermark }) => {
  return (
    <AbsoluteFill style={{ background: project.background, fontFamily: "Inter, sans-serif" }}>
      {project.tracks.map((track) => {
        if (track.hidden || track.type === "effect") return null;
        return track.clips.map((clip) => (
          <Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames}>
            <ClipBody clip={clip} track={track} />
          </Sequence>
        ));
      })}
      {watermark ? (
        <div
          style={{
            position: "absolute",
            right: 36,
            bottom: 48,
            color: "#FFFFFF",
            opacity: 0.78,
            fontWeight: 760,
            letterSpacing: 2,
            fontSize: 28,
          }}
        >
          REELIO
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
