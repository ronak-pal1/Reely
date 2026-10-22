import request from "supertest";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@reelio/timeline-schema";
import { createApp } from "./app.js";

describe("api", () => {
  const app = createApp();

  it("reports schema version on the health check", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.schemaVersion).toBe(SCHEMA_VERSION);
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a request id for unknown routes", async () => {
    const response = await request(app).get("/missing");
    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe("Not found");
    expect(response.body.error.requestId).toBeTruthy();
  });
});
