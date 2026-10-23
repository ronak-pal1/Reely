import type { HydratedDocument } from "mongoose";
import { PLANS } from "@reelio/timeline-schema";
import type { UserDoc } from "../models.js";

export function publicUser(user: HydratedDocument<UserDoc> | UserDoc) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    plan: user.plan,
    credits: user.credits,
    emailVerified: Boolean(user.emailVerifiedAt),
    avatarUrl: user.avatarUrl ?? null,
    limits: PLANS[user.plan],
  };
}
