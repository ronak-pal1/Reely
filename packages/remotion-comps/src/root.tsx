import { Composition, registerRoot } from "remotion";
import {
  createDemoProject,
  migrateProject,
  projectDurationInFrames,
  type Project,
} from "@reelio/timeline-schema";
import { ReelComposition, type ReelCompositionProps } from "./ReelComposition";

const demo = createDemoProject();

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Reel"
      component={ReelComposition}
      durationInFrames={projectDurationInFrames(demo)}
      fps={demo.fps}
      width={demo.width}
      height={demo.height}
      defaultProps={{ project: demo, watermark: false } satisfies ReelCompositionProps}
      calculateMetadata={({ props }) => {
        const project = migrateProject(props.project as Project);
        return {
          durationInFrames: Math.max(1, projectDurationInFrames(project)),
          fps: project.fps,
          width: project.width,
          height: project.height,
          props: { project, watermark: Boolean(props.watermark) },
        };
      }}
    />
  );
};

registerRoot(RemotionRoot);
