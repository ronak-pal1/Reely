import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getConfig } from "../config.js";

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function localRoot(): string {
  return path.resolve(repoRoot(), getConfig().DATA_DIR, "uploads");
}

function localFile(key: string): string {
  const root = localRoot();
  const resolved = path.resolve(root, key);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid storage key");
  return resolved;
}

let s3: S3Client | null = null;

function s3Client(): S3Client {
  if (s3) return s3;
  const config = getConfig();
  s3 = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: config.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  return s3;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const config = getConfig();
  if (config.STORAGE_DRIVER === "s3") {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const file = localFile(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function readObject(key: string): Promise<Buffer> {
  const config = getConfig();
  if (config.STORAGE_DRIVER === "s3") {
    const response = await s3Client().send(
      new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty object");
    return Buffer.from(bytes);
  }
  return readFile(localFile(key));
}

export function openLocalReadStream(key: string) {
  if (getConfig().STORAGE_DRIVER !== "local") return null;
  return createReadStream(localFile(key));
}

export async function deleteObject(key: string): Promise<void> {
  const config = getConfig();
  if (config.STORAGE_DRIVER === "s3") {
    await s3Client().send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return;
  }
  await rm(localFile(key), { force: true });
}

export async function presignPut(key: string, contentType: string): Promise<string | null> {
  const config = getConfig();
  if (config.STORAGE_DRIVER !== "s3") return null;
  return getSignedUrl(
    s3Client(),
    new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 900 },
  );
}

export async function presignGet(key: string): Promise<string | null> {
  const config = getConfig();
  if (config.STORAGE_DRIVER !== "s3") return null;
  return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), {
    expiresIn: 900,
  });
}
