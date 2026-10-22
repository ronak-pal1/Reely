import { ASPECTS, ProjectSchema, SCHEMA_VERSION, type Aspect, type Project } from "./schema.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateToV1(input: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input, schemaVersion: SCHEMA_VERSION };
  const width = typeof next.width === "number" ? next.width : 1080;
  const height = typeof next.height === "number" ? next.height : 1920;
  if (typeof next.aspect !== "string") {
    const match = (Object.entries(ASPECTS) as [Aspect, { width: number; height: number }][]).find(
      ([, size]) => size.width === width && size.height === height,
    );
    next.aspect = match ? match[0] : height >= width ? "9:16" : "16:9";
  }
  if (typeof next.fps !== "number") next.fps = 30;
  if (typeof next.name !== "string" || next.name.length === 0) next.name = "Untitled";
  if (typeof next.id !== "string" || next.id.length === 0) next.id = crypto.randomUUID();
  if (typeof next.background !== "string") next.background = "#000000";
  if (!Array.isArray(next.tracks)) next.tracks = [];
  if (!Array.isArray(next.markers)) next.markers = [];
  next.width = width;
  next.height = height;
  return next;
}

export function migrateProject(input: unknown): Project {
  if (!isRecord(input)) {
    throw new Error("Project must be an object");
  }
  const version = typeof input.schemaVersion === "number" ? input.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Project schema ${version} is newer than supported ${SCHEMA_VERSION}`);
  }
  const migrated = version < 1 ? migrateToV1(input) : input;
  return ProjectSchema.parse(migrated);
}
