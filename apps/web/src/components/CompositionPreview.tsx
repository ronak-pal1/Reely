"use client";

import { Player } from "@remotion/player";
import { ReelComposition } from "@reelio/remotion-comps";
import { createDemoProject, projectDurationInFrames, SCHEMA_VERSION } from "@reelio/timeline-schema";

const project = createDemoProject();

export function CompositionPreview() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-[9/16] w-[280px] overflow-hidden rounded-[28px] border border-line bg-black shadow-glow">
        <Player
          component={ReelComposition}
          inputProps={{ project, watermark: false }}
          durationInFrames={projectDurationInFrames(project)}
          fps={project.fps}
          compositionWidth={project.width}
          compositionHeight={project.height}
          style={{ width: "100%", height: "100%" }}
          controls
          loop
          autoPlay
          initiallyMuted
        />
      </div>
      <p className="text-sm text-mute">
        Schema v{SCHEMA_VERSION} · {project.width}×{project.height} · {project.fps}fps
      </p>
    </div>
  );
}
