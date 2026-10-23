import argon2 from "argon2";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { PLANS } from "@reelio/timeline-schema";
import { getConfig } from "../config.js";
import { HttpError } from "../middleware/error.js";
import { requireCsrf } from "../middleware/csrf.js";
import { EmailToken, Session, User } from "../models.js";
import { sendMail } from "../services/mail.js";
import { randomToken, readToken, refreshExpiryDate, sha256, signToken } from "../services/tokens.js";
import { publicUser } from "../services/users.js";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(80),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const TokenSchema = z.object({ token: z.string().min(20).max(200) });
const ResetSchema = TokenSchema.extend({ password: z.string().min(8).max(200) });
const ForgotSchema = z.object({ email: z.string().email() });

function cookieOptions(httpOnly: boolean) {
  const config = getConfig();
  return {
    httpOnly,
    sameSite: "lax" as const,
    secure: config.NODE_ENV === "production",
    path: "/",
  };
}

export function setCsrfCookie(res: import("express").Response): string {
  const token = randomToken(24);
  res.cookie("reelio_csrf", token, cookieOptions(false));
  return token;
}

async function setSession(res: import("express").Response, userId: string): Promise<void> {
  const access = signToken(userId, "access");
  const refresh = signToken(userId, "refresh");
  await Session.create({
    userId,
    tokenHash: sha256(refresh),
    expiresAt: refreshExpiryDate(),
  });
  res.cookie("reelio_access", access, { ...cookieOptions(true), maxAge: 15 * 60 * 1000 });
  res.cookie("reelio_refresh", refresh, { ...cookieOptions(true), maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function clearSession(res: import("express").Response): void {
  res.clearCookie("reelio_access", cookieOptions(true));
  res.clearCookie("reelio_refresh", cookieOptions(true));
}

async function issueEmailToken(userId: string, purpose: "verify" | "reset"): Promise<string> {
  const token = randomToken();
  await EmailToken.deleteMany({ userId, purpose });
  await EmailToken.create({
    userId,
    purpose,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + (purpose === "verify" ? 24 : 1) * 60 * 60 * 1000),
  });
  return token;
}

export const authRouter = Router();
authRouter.use(authLimiter);

authRouter.get("/csrf", (req, res) => {
  const existing = req.cookies?.reelio_csrf as string | undefined;
  const token = existing && existing.length > 10 ? existing : setCsrfCookie(res);
  res.json({ token });
});

authRouter.post("/signup", requireCsrf, async (req, res, next) => {
  try {
    const body = SignupSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) throw new HttpError(409, "An account with that email already exists");
    const user = await User.create({
      email,
      name: body.name,
      passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }),
      plan: "free",
      credits: PLANS.free.monthlyCredits,
    });
    const token = await issueEmailToken(String(user._id), "verify");
    const url = `${getConfig().WEB_ORIGIN}/verify?token=${encodeURIComponent(token)}`;
    await sendMail({
      to: email,
      subject: "Verify your REELIO account",
      text: `Confirm your email to start editing:\n${url}\nThis link expires in 24 hours.`,
    });
    await setSession(res, String(user._id));
    res.status(201).json({
      user: publicUser(user),
      ...(getConfig().NODE_ENV === "production" ? {} : { verificationUrl: url }),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", requireCsrf, async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email.toLowerCase() });
    const valid = user?.passwordHash ? await argon2.verify(user.passwordHash, body.password) : false;
    if (!user || !valid) throw new HttpError(401, "Invalid email or password");
    await setSession(res, String(user._id));
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", requireCsrf, async (req, res, next) => {
  try {
    const refresh = req.cookies?.reelio_refresh as string | undefined;
    if (refresh) await Session.deleteOne({ tokenHash: sha256(refresh) });
    clearSession(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", requireCsrf, async (req, res, next) => {
  try {
    const refresh = req.cookies?.reelio_refresh as string | undefined;
    if (!refresh) throw new HttpError(401, "Sign in required");
    const payload = readToken(refresh, "refresh");
    const session = await Session.findOne({ tokenHash: sha256(refresh), userId: payload.sub });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new HttpError(401, "Sign in required");
    }
    await session.deleteOne();
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, "Sign in required");
    await setSession(res, String(user._id));
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Sign in required"));
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const token = req.cookies?.reelio_access as string | undefined;
    if (!token) throw new HttpError(401, "Sign in required");
    const payload = readToken(token, "access");
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, "Sign in required");
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Sign in required"));
  }
});

authRouter.post("/verify", requireCsrf, async (req, res, next) => {
  try {
    const { token } = TokenSchema.parse(req.body);
    const record = await EmailToken.findOne({ purpose: "verify", tokenHash: sha256(token) });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "Verification link is invalid or expired");
    }
    const user = await User.findByIdAndUpdate(
      record.userId,
      { emailVerifiedAt: new Date() },
      { new: true },
    );
    await record.deleteOne();
    if (!user) throw new HttpError(400, "Verification link is invalid or expired");
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/resend-verification", requireCsrf, async (req, res, next) => {
  try {
    const token = req.cookies?.reelio_access as string | undefined;
    if (!token) throw new HttpError(401, "Sign in required");
    const payload = readToken(token, "access");
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, "Sign in required");
    if (user.emailVerifiedAt) {
      res.json({ ok: true });
      return;
    }
    const verifyToken = await issueEmailToken(String(user._id), "verify");
    const url = `${getConfig().WEB_ORIGIN}/verify?token=${encodeURIComponent(verifyToken)}`;
    await sendMail({
      to: user.email,
      subject: "Verify your REELIO account",
      text: `Confirm your email:\n${url}`,
    });
    res.json({
      ok: true,
      ...(getConfig().NODE_ENV === "production" ? {} : { verificationUrl: url }),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/forgot", requireCsrf, async (req, res, next) => {
  try {
    const { email } = ForgotSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    let resetUrl: string | undefined;
    if (user?.passwordHash) {
      const token = await issueEmailToken(String(user._id), "reset");
      resetUrl = `${getConfig().WEB_ORIGIN}/reset?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: user.email,
        subject: "Reset your REELIO password",
        text: `Choose a new password:\n${resetUrl}\nThis link expires in 1 hour.`,
      });
    }
    res.json({
      ok: true,
      ...(getConfig().NODE_ENV === "production" || !resetUrl ? {} : { resetUrl }),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/reset", requireCsrf, async (req, res, next) => {
  try {
    const body = ResetSchema.parse(req.body);
    const record = await EmailToken.findOne({ purpose: "reset", tokenHash: sha256(body.token) });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "Reset link is invalid or expired");
    }
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    await User.findByIdAndUpdate(record.userId, { passwordHash });
    await EmailToken.deleteMany({ userId: record.userId, purpose: "reset" });
    await Session.deleteMany({ userId: record.userId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/google", (req, res, next) => {
  try {
    const config = getConfig();
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      throw new HttpError(503, "Google sign-in is not configured");
    }
    const state = randomToken(24);
    res.cookie("reelio_oauth_state", state, { ...cookieOptions(true), maxAge: 10 * 60 * 1000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", config.GOOGLE_CALLBACK_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    res.redirect(url.toString());
  } catch (error) {
    next(error);
  }
});

authRouter.get("/google/callback", async (req, res, next) => {
  try {
    const config = getConfig();
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const expected = req.cookies?.reelio_oauth_state as string | undefined;
    res.clearCookie("reelio_oauth_state", cookieOptions(true));
    if (!code || !state || !expected || state !== expected) {
      throw new HttpError(400, "Google sign-in was rejected");
    }
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: config.GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new HttpError(401, "Google sign-in failed");
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new HttpError(401, "Google sign-in failed");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileResponse.ok) throw new HttpError(401, "Google sign-in failed");
    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!profile.sub || !profile.email || profile.email_verified === false) {
      throw new HttpError(400, "Google did not return a verified email");
    }
    const email = profile.email.toLowerCase();
    let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email }] });
    if (!user) {
      user = await User.create({
        email,
        name: profile.name?.trim() || email.split("@")[0] || "Creator",
        googleId: profile.sub,
        emailVerifiedAt: new Date(),
        avatarUrl: profile.picture,
        plan: "free",
        credits: PLANS.free.monthlyCredits,
      });
    } else {
      user.googleId = profile.sub;
      user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
      if (profile.picture && !user.avatarUrl) user.avatarUrl = profile.picture;
      await user.save();
    }
    await setSession(res, String(user._id));
    res.redirect(`${config.WEB_ORIGIN}/dashboard`);
  } catch (error) {
    next(error);
  }
});
