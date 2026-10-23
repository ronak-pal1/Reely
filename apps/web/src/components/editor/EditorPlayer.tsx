"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { ReelComposition } from "@reelio/remotion-comps";
import { projectDurationInFrames, type Project } from "@reelio/timeline-schema";
import { useEffect, useRef } from "react";
type EditorPlayerProps = {
  project: Project;
  frame: number;
  playing: boolean;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
};

export function EditorPlayer({ project, frame, playing, onFrame, onPlaying }: EditorPlayerProps) {
  const ref = useRef<PlayerRef>(null);
  const onFrameRef = useRef(onFrame);
  const onPlayingRef = useRef(onPlaying);
  onFrameRef.current = onFrame;
  onPlayingRef.current = onPlaying;
  const duration = Math.max(1, projectDurationInFrames(project));

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const onUpdate = (event: { detail: { frame: number } }) => {
      const next = event.detail.frame;
      onFrameRef.current(next);
      if (next >= duration - 1) {
        player.pause();
        onPlayingRef.current(false);
      }
    };
    player.addEventListener("frameupdate", onUpdate);
    return () => {
      player.removeEventListener("frameupdate", onUpdate);
    };
  }, [duration]);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    if (playing) void player.play();
    else player.pause();
  }, [playing]);

  useEffect(() => {
    const player = ref.current;
    if (!player || playing) return;
    if (player.getCurrentFrame() !== frame) player.seekTo(Math.min(frame, duration - 1));
  }, [frame, playing, duration, project]);

  return (
    <div className="absolute inset-0">
      <Player
        ref={ref}
        component={ReelComposition}
        inputProps={{ project, watermark: false }}
        durationInFrames={duration}
        fps={project.fps}
        compositionWidth={project.width}
        compositionHeight={project.height}
        style={{ width: "100%", height: "100%" }}
        initiallyMuted
        clickToPlay={false}
        acknowledgeRemotionLicense
      />
      <button
        type="button"
        className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white"
        onClick={() => {
          const player = ref.current;
          if (!player) return;
          if (player.isMuted()) player.unmute();
          else player.mute();
        }}
      >
        Sound
      </button>
    </div>
  );
}
