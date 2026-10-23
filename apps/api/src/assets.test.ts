import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./db.js";
import { startAssetWorker } from "./queues.js";
import { Asset } from "./models.js";

const app = createApp();

async function session() {
  const agent = request.agent(app);
  const csrfResponse = await agent.get("/auth/csrf");
  const token = csrfResponse.body.token as string;
  const email = `media-${crypto.randomUUID()}@reelio.test`;
  const signup = await agent
    .post("/auth/signup")
    .set("x-csrf-token", token)
    .send({ email, password: "correct-horse", name: "Media" });
  const verify = new URL(signup.body.verificationUrl).searchParams.get("token");
  await agent.post("/auth/verify").set("x-csrf-token", token).send({ token: verify });
  const project = await agent.post("/projects").set("x-csrf-token", token).send({ name: "Media project" });
  return { agent, token, projectId: project.body.project.id as string };
}

describe("asset pipeline", () => {
  let memory: MongoMemoryServer;
  let worker: ReturnType<typeof startAssetWorker>;

  beforeAll(async () => {
    memory = await MongoMemoryServer.create();
    await connectDb(memory.getUri());
    worker = startAssetWorker();
  }, 60_000);

  afterAll(async () => {
    await worker.close();
    await disconnectDb();
    await memory.stop();
  });

  it("stores a clip and builds a proxy, thumbnail, and waveform", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "reelio-src-"));
    const file = path.join(dir, "clip.mp4");
    const encoded = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x240:rate=15",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=44100",
        "-t",
        "2",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        file,
      ],
      { encoding: "utf8" },
    );
    expect(encoded.status).toBe(0);
    const bytes = await readFile(file);
    const { agent, token, projectId } = await session();
    const created = await agent
      .post("/assets")
      .set("x-csrf-token", token)
      .send({ filename: "clip.mp4", contentType: "video/mp4", bytes: bytes.length, projectId });
    expect(created.status).toBe(201);
    const id = created.body.asset.id as string;
    const uploaded = await agent
      .put(`/assets/${id}/content`)
      .set("x-csrf-token", token)
      .set("content-type", "video/mp4")
      .send(bytes);
    expect(uploaded.status).toBe(200);
    const confirmed = await agent.post(`/assets/${id}/confirm`).set("x-csrf-token", token);
    expect(confirmed.status).toBe(200);

    let ready = await Asset.findById(id);
    for (let attempt = 0; attempt < 40 && ready?.status !== "ready" && ready?.status !== "failed"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      ready = await Asset.findById(id);
    }
    expect(ready?.status).toBe("ready");
    expect(ready?.thumbnailKey).toBeTruthy();
    expect(ready?.proxyKey).toBeTruthy();
    expect(ready?.waveform?.length).toBe(120);
    expect(ready?.durationSeconds ?? 0).toBeGreaterThan(1);

    const listed = await agent.get(`/assets?projectId=${projectId}`);
    expect(listed.body.assets).toHaveLength(1);
    expect(listed.body.assets[0].urls.thumb).toContain("variant=thumb");

    const removed = await agent.delete(`/assets/${id}`).set("x-csrf-token", token);
    expect(removed.status).toBe(200);
  }, 60_000);
});
