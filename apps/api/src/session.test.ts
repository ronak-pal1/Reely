import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./db.js";
import { Project, User } from "./models.js";

let memory: MongoMemoryServer;
const app = createApp();

async function csrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const response = await agent.get("/auth/csrf");
  expect(response.status).toBe(200);
  return response.body.token as string;
}

describe("auth and projects", () => {
  beforeAll(async () => {
    memory = await MongoMemoryServer.create();
    await connectDb(memory.getUri());
  }, 60_000);

  afterAll(async () => {
    await disconnectDb();
    await memory.stop();
  });

  it("signs up, verifies email, and keeps another user's project private", async () => {
    const ada = request.agent(app);
    const adaToken = await csrf(ada);
    const signup = await ada
      .post("/auth/signup")
      .set("x-csrf-token", adaToken)
      .send({ email: "ada@reelio.test", password: "correct-horse", name: "Ada" });
    expect(signup.status).toBe(201);
    expect(signup.body.user.emailVerified).toBe(false);
    expect(signup.body.user.credits).toBe(30);
    expect(signup.body.user.passwordHash).toBeUndefined();
    expect(signup.body.verificationUrl).toContain("/verify?token=");

    const blocked = await ada.post("/projects").set("x-csrf-token", adaToken).send({ name: "Draft" });
    expect(blocked.status).toBe(403);

    const token = new URL(signup.body.verificationUrl).searchParams.get("token");
    const verified = await ada.post("/auth/verify").set("x-csrf-token", adaToken).send({ token });
    expect(verified.status).toBe(200);
    expect(verified.body.user.emailVerified).toBe(true);

    const created = await ada.post("/projects").set("x-csrf-token", adaToken).send({ name: "Outfit check" });
    expect(created.status).toBe(201);
    expect(created.body.project.timeline.schemaVersion).toBe(1);
    const projectId = created.body.project.id as string;

    const renamed = await ada
      .patch(`/projects/${projectId}`)
      .set("x-csrf-token", adaToken)
      .send({ name: "Fit check" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.project.name).toBe("Fit check");

    const version = await ada
      .post(`/projects/${projectId}/versions`)
      .set("x-csrf-token", adaToken)
      .send({ name: "Before captions" });
    expect(version.status).toBe(201);

    const duplicate = await ada
      .post(`/projects/${projectId}/duplicate`)
      .set("x-csrf-token", adaToken)
      .send({});
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.project.name).toBe("Copy of Fit check");

    const grace = request.agent(app);
    const graceToken = await csrf(grace);
    await grace
      .post("/auth/signup")
      .set("x-csrf-token", graceToken)
      .send({ email: "grace@reelio.test", password: "another-secret", name: "Grace" });
    const foreign = await grace.get(`/projects/${projectId}`);
    expect(foreign.status).toBe(404);
    const graceVerify = await grace.post("/auth/verify").set("x-csrf-token", graceToken);
    expect(graceVerify.status).toBe(400);
    const graceUser = await User.findOne({ email: "grace@reelio.test" });
    await User.updateOne({ _id: graceUser?._id }, { emailVerifiedAt: new Date() });
    const stillForeign = await grace.get(`/projects/${projectId}`);
    expect(stillForeign.status).toBe(404);

    const missing = await ada.post("/auth/login").set("x-csrf-token", adaToken).send({
      email: "ada@reelio.test",
      password: "wrong-password",
    });
    expect(missing.status).toBe(401);

    const me = await ada.get("/users/me");
    expect(me.body.user.name).toBe("Ada");
    const profile = await ada.patch("/users/me").set("x-csrf-token", adaToken).send({ name: "Ada Lovelace" });
    expect(profile.body.user.name).toBe("Ada Lovelace");

    const templates = await ada.get("/templates");
    expect(templates.body.templates.length).toBeGreaterThanOrEqual(3);
    const fromTemplate = await ada
      .post("/projects")
      .set("x-csrf-token", adaToken)
      .send({ templateId: templates.body.templates[0].id });
    expect(fromTemplate.status).toBe(201);

    const removed = await ada.delete(`/projects/${projectId}`).set("x-csrf-token", adaToken);
    expect(removed.status).toBe(200);
    const gone = await Project.findById(projectId);
    expect(gone?.deletedAt).toBeTruthy();

    const google = await ada.get("/auth/google");
    expect(google.status).toBe(503);
  });

  it("rejects a mutation without a CSRF token", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "ada@reelio.test",
      password: "correct-horse",
    });
    expect(response.status).toBe(403);
  });

  it("resets a password and rotates the session", async () => {
    const agent = request.agent(app);
    const token = await csrf(agent);
    const forgot = await agent
      .post("/auth/forgot")
      .set("x-csrf-token", token)
      .send({ email: "ada@reelio.test" });
    expect(forgot.status).toBe(200);
    const resetToken = new URL(forgot.body.resetUrl).searchParams.get("token");
    const reset = await agent
      .post("/auth/reset")
      .set("x-csrf-token", token)
      .send({ token: resetToken, password: "new-password-1" });
    expect(reset.status).toBe(200);
    const login = await agent.post("/auth/login").set("x-csrf-token", token).send({
      email: "ada@reelio.test",
      password: "new-password-1",
    });
    expect(login.status).toBe(200);
    const refresh = await agent.post("/auth/refresh").set("x-csrf-token", token);
    expect(refresh.status).toBe(200);
    const logout = await agent.post("/auth/logout").set("x-csrf-token", token);
    expect(logout.status).toBe(200);
    const me = await agent.get("/auth/me");
    expect(me.status).toBe(401);
  });
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
