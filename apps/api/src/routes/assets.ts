import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import express from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { getConfig } from "../config.js";
import { HttpError } from "../middleware/error.js";
import { requireUser, requireVerified } from "../middleware/auth.js";
import { Asset, Project } from "../models.js";
import { enqueueAsset } from "../queues.js";
import { ALLOWED_MEDIA_TYPES, removeAssetFiles } from "../services/media.js";
import { openLocalReadStream, presignGet, presignPut, putObject } from "../services/storage.js";

const CreateSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().min(1).max(120),
  bytes: z.number().int().positive(),
  projectId: z.string().optional(),
});

function signVariant(assetId: string, variant: string, exp: number): string {
  return createHmac("sha256", getConfig().JWT_ACCESS_SECRET)
    .update(`${assetId}.${variant}.${exp}`)
    .digest("base64url");
}

function fileUrl(assetId: string, variant: "original" | "proxy" | "thumb" | "strip"): string {
  const exp = Date.now() + 15 * 60 * 1000;
  const token = signVariant(assetId, variant, exp);
  return `${getConfig().API_URL}/assets/${assetId}/file?variant=${variant}&exp=${exp}&token=${token}`;
}

function present(asset: {
  _id: mongoose.Types.ObjectId;
  filename: string;
  contentType: string;
  bytes: number;
  status: string;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  waveform?: number[] | null;
  error?: string | null;
  projectId?: mongoose.Types.ObjectId | null;
  thumbnailKey?: string | null;
  proxyKey?: string | null;
  filmstripKey?: string | null;
}) {
  const id = String(asset._id);
  return {
    id,
    filename: asset.filename,
    contentType: asset.contentType,
    bytes: asset.bytes,
    status: asset.status,
    durationSeconds: asset.durationSeconds ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    waveform: asset.waveform ?? [],
    error: asset.error ?? null,
    projectId: asset.projectId ? String(asset.projectId) : null,
    urls:
      asset.status === "ready"
        ? {
            original: fileUrl(id, "original"),
            proxy: asset.proxyKey ? fileUrl(id, "proxy") : null,
            thumb: asset.thumbnailKey ? fileUrl(id, "thumb") : null,
            strip: asset.filmstripKey ? fileUrl(id, "strip") : null,
          }
        : null,
  };
}

async function ownAsset(userId: mongoose.Types.ObjectId, assetId: string | undefined) {
  if (!assetId || !mongoose.isValidObjectId(assetId)) throw new HttpError(404, "Asset not found");
  const asset = await Asset.findOne({ _id: assetId, userId, deletedAt: null });
  if (!asset) throw new HttpError(404, "Asset not found");
  return asset;
}

export const assetRouter = Router();

assetRouter.get("/:id/file", async (req, res, next) => {
  try {
    const variant = typeof req.query.variant === "string" ? req.query.variant : "original";
    const exp = Number(req.query.exp);
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!req.params.id || !Number.isFinite(exp) || exp < Date.now()) {
      throw new HttpError(401, "Media link expired");
    }
    const expected = signVariant(req.params.id, variant, exp);
    const left = Buffer.from(token);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new HttpError(401, "Media link expired");
    }
    const asset = await Asset.findOne({ _id: req.params.id, deletedAt: null });
    if (!asset) throw new HttpError(404, "Asset not found");
    const key =
      variant === "proxy"
        ? asset.proxyKey
        : variant === "thumb"
          ? asset.thumbnailKey
          : variant === "strip"
            ? asset.filmstripKey
            : asset.storageKey;
    if (!key) throw new HttpError(404, "Asset not found");
    const remote = await presignGet(key);
    if (remote) {
      res.redirect(remote);
      return;
    }
    const stream = openLocalReadStream(key);
    if (!stream) throw new HttpError(404, "Asset not found");
    const type =
      variant === "thumb" || variant === "strip"
        ? "image/jpeg"
        : variant === "proxy"
          ? "video/mp4"
          : asset.contentType;
    res.setHeader("content-type", type);
    res.setHeader("cache-control", "private, max-age=300");
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

assetRouter.use(requireUser);

assetRouter.get("/", async (req, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const filter: Record<string, unknown> = { userId: req.user!._id, deletedAt: null };
    if (projectId) {
      if (!mongoose.isValidObjectId(projectId)) throw new HttpError(404, "Project not found");
      filter.projectId = projectId;
    }
    const assets = await Asset.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ assets: assets.map((asset) => present(asset)) });
  } catch (error) {
    next(error);
  }
});

assetRouter.post("/", requireVerified, async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body);
    if (!ALLOWED_MEDIA_TYPES.has(body.contentType)) {
      throw new HttpError(400, "Unsupported file type");
    }
    if (body.bytes > getConfig().MAX_UPLOAD_BYTES) throw new HttpError(413, "File is too large");
    let projectId: mongoose.Types.ObjectId | undefined;
    if (body.projectId) {
      if (!mongoose.isValidObjectId(body.projectId)) throw new HttpError(404, "Project not found");
      const project = await Project.findOne({ _id: body.projectId, userId: req.user!._id, deletedAt: null });
      if (!project) throw new HttpError(404, "Project not found");
      projectId = project._id;
    }
    const asset = await Asset.create({
      userId: req.user!._id,
      projectId,
      filename: body.filename,
      contentType: body.contentType,
      bytes: body.bytes,
      storageKey: `users/${String(req.user!._id)}/${crypto.randomUUID()}`,
      status: "uploading",
    });
    const uploadUrl = await presignPut(asset.storageKey, body.contentType);
    res.status(201).json({
      asset: present(asset),
      upload: uploadUrl
        ? { method: "PUT", url: uploadUrl, headers: { "content-type": body.contentType } }
        : {
            method: "PUT",
            url: `${getConfig().API_URL}/assets/${String(asset._id)}/content`,
            headers: { "content-type": body.contentType },
          },
    });
  } catch (error) {
    next(error);
  }
});

assetRouter.put(
  "/:id/content",
  requireVerified,
  express.raw({ type: () => true, limit: "500mb" }),
  async (req, res, next) => {
    try {
      const asset = await ownAsset(req.user!._id, req.params.id);
      if (asset.status !== "uploading") throw new HttpError(409, "Upload already finished");
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (body.length === 0) throw new HttpError(400, "Empty upload");
      if (body.length > getConfig().MAX_UPLOAD_BYTES) throw new HttpError(413, "File is too large");
      await putObject(asset.storageKey, body, asset.contentType);
      asset.bytes = body.length;
      await asset.save();
      res.json({ asset: present(asset) });
    } catch (error) {
      next(error);
    }
  },
);

assetRouter.post("/:id/confirm", requireVerified, async (req, res, next) => {
  try {
    const asset = await ownAsset(req.user!._id, req.params.id);
    if (asset.status === "ready") {
      res.json({ asset: present(asset) });
      return;
    }
    await enqueueAsset(String(asset._id));
    asset.status = "processing";
    await asset.save();
    res.json({ asset: present(asset) });
  } catch (error) {
    next(error);
  }
});

assetRouter.get("/:id", async (req, res, next) => {
  try {
    const asset = await ownAsset(req.user!._id, req.params.id);
    res.json({ asset: present(asset) });
  } catch (error) {
    next(error);
  }
});

assetRouter.delete("/:id", requireVerified, async (req, res, next) => {
  try {
    const asset = await ownAsset(req.user!._id, req.params.id);
    asset.deletedAt = new Date();
    await asset.save();
    await removeAssetFiles(asset);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
