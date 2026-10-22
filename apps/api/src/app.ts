import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttpImport from "pino-http";
import { SCHEMA_VERSION } from "@reelio/timeline-schema";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { requireCsrf } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/error.js";
import { requestId } from "./middleware/requestId.js";
import { authRouter } from "./routes/auth.js";
import { projectRouter } from "./routes/projects.js";
import { templateRouter } from "./routes/templates.js";
import { userRouter } from "./routes/users.js";
import "./types.js";

const pinoHttp = (
  typeof pinoHttpImport === "function"
    ? pinoHttpImport
    : (pinoHttpImport as { default: unknown }).default
) as (options: { logger: typeof logger }) => RequestHandler;

export function createApp() {
  const config = getConfig();
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
  const allowedOrigins = new Set([config.WEB_ORIGIN]);
  if (config.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
  }
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
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
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(requireCsrf);
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "reelio-api",
      schemaVersion: SCHEMA_VERSION,
      requestId: req.id,
    });
  });
  app.use("/auth", authRouter);
  app.use("/users", userRouter);
  app.use("/projects", projectRouter);
  app.use("/templates", templateRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: { message: "Not found", requestId: _req.id } });
  });
  app.use(errorHandler);
  return app;
}
