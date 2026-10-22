import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./error.js";
import { User } from "../models.js";
import { readToken } from "../services/tokens.js";

export async function requireUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.reelio_access as string | undefined;
    if (!token) throw new HttpError(401, "Sign in required");
    const payload = readToken(token, "access");
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, "Sign in required");
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, "Sign in required"));
  }
}

export function requireVerified(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.emailVerifiedAt) {
    next(new HttpError(403, "Verify your email before continuing"));
    return;
  }
  next();
}
