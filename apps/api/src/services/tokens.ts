import { createHash, randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { getConfig } from "../config.js";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

type TokenType = "access" | "refresh";

export function signToken(userId: string, type: TokenType): string {
  const config = getConfig();
  const secret = type === "access" ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET;
  const expiresIn = (type === "access" ? config.JWT_ACCESS_TTL : config.JWT_REFRESH_TTL) as SignOptions["expiresIn"];
  return jwt.sign({ sub: userId, typ: type }, secret, { expiresIn });
}

export function readToken(token: string, type: TokenType): { sub: string } {
  const config = getConfig();
  const secret = type === "access" ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET;
  const payload = jwt.verify(token, secret);
  if (typeof payload === "string" || payload.sub === undefined || payload.typ !== type) {
    throw new Error("Invalid token");
  }
  return { sub: payload.sub };
}

export function refreshExpiryDate(): Date {
  const ttl = getConfig().JWT_REFRESH_TTL;
  const match = /^(\d+)([dhm])$/.exec(ttl);
  const amount = match ? Number(match[1]) : 30;
  const unit = match?.[2] ?? "d";
  const ms = unit === "d" ? amount * 86_400_000 : unit === "h" ? amount * 3_600_000 : amount * 60_000;
  return new Date(Date.now() + ms);
}
