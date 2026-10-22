import cors from "cors";
import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttpImport from "pino-http";
import { SCHEMA_VERSION } from "@reelio/timeline-schema";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { errorHandler } from "./middleware/error.js";
import { requestId } from "./middleware/requestId.js";
import "./types.js";

const pinoHttp = (
  typeof pinoHttpImport === "function"
    ? pinoHttpImport
    : (pinoHttpImport as { default: unknown }).default
) as (options: { logger: typeof logger }) => RequestHandler;

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestId);
  if (config.NODE_ENV !== "test") {
    app.use(pinoHttp({ logger }));
  }
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: config.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.NODE_ENV === "test" ? 10_000 : 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "reelio-api",
      schemaVersion: SCHEMA_VERSION,
      requestId: req.id,
    });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: { message: "Not found", requestId: _req.id } });
  });
  app.use(errorHandler);
  return app;
}
