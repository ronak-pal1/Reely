import { ClipSchema, type Clip, type Project, type TrackType } from "@reelio/timeline-schema";

export type MediaAsset = {
  id: string;
  filename: string;
  contentType: string;
  status: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  error: string | null;
  waveform: number[];
  urls: { original: string; proxy: string | null; thumb: string | null; strip: string | null } | null;
};

export function assetRef(assetId: string): string {
  return `asset:${assetId}`;
}

export function assetIdFrom(src: string | undefined): string | null {
  if (!src?.startsWith("asset:")) return null;
  const id = src.slice("asset:".length);
  return id.length > 0 ? id : null;
}

export function trackForContent(contentType: string): TrackType {
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("image/")) return "sticker";
  return "video";
}

export function assetDurationFrames(asset: MediaAsset, fps: number): number {
  if (asset.durationSeconds && asset.durationSeconds > 0) {
    return Math.max(1, Math.round(asset.durationSeconds * fps));
  }
  return Math.max(1, fps * 3);
}

export function clipFromAsset(asset: MediaAsset, from: number, fps: number): Clip {
  const durationInFrames = assetDurationFrames(asset, fps);
  const image = asset.contentType.startsWith("image/");
  return ClipSchema.parse({
    id: crypto.randomUUID(),
    name: asset.filename,
    src: image ? undefined : assetRef(asset.id),
    from,
    durationInFrames,
    props: {
      assetId: asset.id,
      imageSrc: image ? assetRef(asset.id) : undefined,
    },
  });
}

export function resolvePlayback(project: Project, assets: MediaAsset[]): Project {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const assetId = clip.props.assetId ?? assetIdFrom(clip.src) ?? assetIdFrom(clip.props.imageSrc);
        const asset = assetId ? byId.get(assetId) : undefined;
        if (!asset?.urls) return clip;
        if (track.type === "video") return { ...clip, src: asset.urls.proxy ?? asset.urls.original };
        if (track.type === "audio") return { ...clip, src: asset.urls.original };
        if (track.type === "sticker" && clip.props.imageSrc?.startsWith("asset:")) {
          return { ...clip, props: { ...clip.props, imageSrc: asset.urls.original } };
        }
        return clip;
      }),
    })),
  };
}

export function findClip(project: Project, clipId: string | null): { trackId: string; clip: Clip } | null {
  if (!clipId) return null;
  for (const track of project.tracks) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip) return { trackId: track.id, clip };
  }
  return null;
}

export function endOfTrack(project: Project, trackId: string): number {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) return 0;
  return track.clips.reduce((max, clip) => Math.max(max, clip.from + clip.durationInFrames), 0);
}
