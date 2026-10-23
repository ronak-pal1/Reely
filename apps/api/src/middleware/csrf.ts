import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./error.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) {
    next();
    return;
  }
  const header = req.header("x-csrf-token");
  const cookie = req.cookies?.reelio_csrf as string | undefined;
  if (!header || !cookie || header !== cookie) {
    next(new HttpError(403, "CSRF token missing"));
    return;
  }
  next();
}
