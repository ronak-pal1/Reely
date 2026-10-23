import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Invalid request",
        issues: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        requestId: req.id,
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: { message: err.message, requestId: req.id },
    });
    return;
  }
  logger.error({ err, requestId: req.id }, "unhandled error");
  res.status(500).json({
    error: { message: "Internal error", requestId: req.id },
  });
}
