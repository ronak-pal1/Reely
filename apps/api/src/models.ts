import mongoose, { type InferSchemaType } from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String, index: true, sparse: true },
    name: { type: String, required: true, trim: true },
    emailVerifiedAt: { type: Date },
    plan: { type: String, enum: ["free", "pro", "studio"], default: "free", required: true },
    credits: { type: Number, required: true, min: 0, default: 30 },
    lemonCustomerId: { type: String },
    lemonSubscriptionId: { type: String },
    subscriptionStatus: { type: String },
    currentPeriodEnd: { type: Date },
    avatarUrl: { type: String },
  },
  { timestamps: true },
);

const SessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

const EmailTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["verify", "reset"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const ProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    timeline: { type: mongoose.Schema.Types.Mixed, required: true },
    aspect: { type: String, enum: ["9:16", "1:1", "16:9"], required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
ProjectSchema.index({ userId: 1, createdAt: -1 });
ProjectSchema.index({ userId: 1, deletedAt: 1 });

const ProjectVersionSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    timeline: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

const AssetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    bytes: { type: Number, required: true, min: 0 },
    storageKey: { type: String, required: true },
    proxyKey: { type: String },
    thumbnailKey: { type: String },
    filmstripKey: { type: String },
    waveform: { type: [Number], default: [] },
    durationSeconds: { type: Number },
    width: { type: Number },
    height: { type: Number },
    status: {
      type: String,
      enum: ["uploading", "processing", "ready", "failed"],
      default: "uploading",
      required: true,
    },
    error: { type: String },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
AssetSchema.index({ userId: 1, createdAt: -1 });

const RenderJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "rendering", "done", "failed"],
      default: "queued",
      required: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    fps: { type: Number, required: true },
    quality: { type: String, enum: ["draft", "standard", "high"], default: "standard" },
    watermark: { type: Boolean, required: true },
    outputKey: { type: String },
    error: { type: String },
    creditLedgerId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
);
RenderJobSchema.index({ userId: 1, createdAt: -1 });

const CreditLedgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    action: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ["charged", "refunded"], required: true },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);
CreditLedgerSchema.index({ userId: 1, createdAt: -1 });

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lemonSubscriptionId: { type: String, required: true, unique: true },
    plan: { type: String, enum: ["free", "pro", "studio"], required: true },
    status: { type: String, required: true },
    variantId: { type: String },
    renewsAt: { type: Date },
  },
  { timestamps: true },
);

const WebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

const TemplateSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    aspect: { type: String, enum: ["9:16", "1:1", "16:9"], required: true },
    timeline: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", UserSchema);
export const Session = mongoose.model("Session", SessionSchema);
export const EmailToken = mongoose.model("EmailToken", EmailTokenSchema);
export const Project = mongoose.model("Project", ProjectSchema);
export const ProjectVersion = mongoose.model("ProjectVersion", ProjectVersionSchema);
export const Asset = mongoose.model("Asset", AssetSchema);
export const RenderJob = mongoose.model("RenderJob", RenderJobSchema);
export const CreditLedger = mongoose.model("CreditLedger", CreditLedgerSchema);
export const Subscription = mongoose.model("Subscription", SubscriptionSchema);
export const WebhookEvent = mongoose.model("WebhookEvent", WebhookEventSchema);
export const Template = mongoose.model("Template", TemplateSchema);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };
