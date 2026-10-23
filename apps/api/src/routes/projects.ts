import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { createEmptyProject, migrateProject } from "@reelio/timeline-schema";
import { HttpError } from "../middleware/error.js";
import { requireUser, requireVerified } from "../middleware/auth.js";
import { Project, ProjectVersion, Template } from "../models.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ownProject(userId: mongoose.Types.ObjectId, projectId: string | undefined) {
  if (!projectId || !mongoose.isValidObjectId(projectId)) throw new HttpError(404, "Project not found");
  const project = await Project.findOne({ _id: projectId, userId, deletedAt: null });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

function present(project: {
  _id: mongoose.Types.ObjectId;
  name: string;
  aspect: string;
  timeline: unknown;
  updatedAt: Date;
  createdAt: Date;
  templateId?: mongoose.Types.ObjectId | null;
}) {
  const timeline = migrateProject(project.timeline);
  return {
    id: String(project._id),
    name: project.name,
    aspect: project.aspect,
    timeline,
    templateId: project.templateId ? String(project.templateId) : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  templateId: z.string().optional(),
  aspect: z.enum(["9:16", "1:1", "16:9"]).optional(),
});

const RenameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const projectRouter = Router();
projectRouter.use(requireUser);

projectRouter.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const filter: Record<string, unknown> = { userId: req.user!._id, deletedAt: null };
    if (q) filter.name = new RegExp(escapeRegex(q), "i");
    const projects = await Project.find(filter).sort({ updatedAt: -1 }).limit(100);
    res.json({ projects: projects.map((project) => present(project)) });
  } catch (error) {
    next(error);
  }
});

projectRouter.post("/", requireVerified, async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body ?? {});
    let timeline = createEmptyProject({
      name: body.name ?? "Untitled",
      aspect: body.aspect ?? "9:16",
    });
    let templateId: mongoose.Types.ObjectId | undefined;
    if (body.templateId) {
      if (!mongoose.isValidObjectId(body.templateId)) throw new HttpError(404, "Template not found");
      const template = await Template.findById(body.templateId);
      if (!template) throw new HttpError(404, "Template not found");
      timeline = migrateProject(template.timeline);
      timeline = { ...timeline, id: crypto.randomUUID(), name: body.name ?? template.name };
      templateId = template._id;
    }
    const project = await Project.create({
      userId: req.user!._id,
      name: timeline.name,
      aspect: timeline.aspect,
      timeline,
      templateId,
    });
    res.status(201).json({ project: present(project) });
  } catch (error) {
    next(error);
  }
});

projectRouter.get("/:id", async (req, res, next) => {
  try {
    const project = await ownProject(req.user!._id, req.params.id);
    res.json({ project: present(project) });
  } catch (error) {
    next(error);
  }
});

projectRouter.patch("/:id", requireVerified, async (req, res, next) => {
  try {
    const project = await ownProject(req.user!._id, req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        timeline: z.unknown().optional(),
      })
      .parse(req.body ?? {});
    if (body.name) {
      project.name = body.name;
      if (project.timeline && typeof project.timeline === "object") {
        project.timeline = { ...(project.timeline as object), name: body.name };
        project.markModified("timeline");
      }
    }
    if (body.timeline) {
      const timeline = migrateProject(body.timeline);
      project.timeline = timeline;
      project.aspect = timeline.aspect;
      project.name = timeline.name || project.name;
      project.markModified("timeline");
    }
    await project.save();
    res.json({ project: present(project) });
  } catch (error) {
    next(error);
  }
});

projectRouter.delete("/:id", requireVerified, async (req, res, next) => {
  try {
    const project = await ownProject(req.user!._id, req.params.id);
    project.deletedAt = new Date();
    await project.save();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

projectRouter.post("/:id/duplicate", requireVerified, async (req, res, next) => {
  try {
    const project = await ownProject(req.user!._id, req.params.id);
    const timeline = migrateProject(project.timeline);
    const copy = await Project.create({
      userId: req.user!._id,
      name: `Copy of ${project.name}`,
      aspect: project.aspect,
      timeline: { ...timeline, id: crypto.randomUUID(), name: `Copy of ${project.name}` },
    });
    res.status(201).json({ project: present(copy) });
  } catch (error) {
    next(error);
  }
});

projectRouter.get("/:id/versions", async (req, res, next) => {
  try {
    const project = await ownProject(req.user!._id, req.params.id);
    const versions = await ProjectVersion.find({ projectId: project._id, userId: req.user!._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({
      versions: versions.map((version) => ({
        id: String(version._id),
        name: version.name,
        createdAt: version.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

projectRouter.post("/:id/versions", requireVerified, async (req, res, next) => {
  try {
    const project = await ownProject(req.user!._id, req.params.id);
    const name = RenameSchema.parse({ name: req.body?.name ?? project.name }).name;
    const version = await ProjectVersion.create({
      projectId: project._id,
      userId: req.user!._id,
      name,
      timeline: project.timeline,
    });
    res.status(201).json({ version: { id: String(version._id), name: version.name, createdAt: version.createdAt } });
  } catch (error) {
    next(error);
  }
});

projectRouter.post("/:id/versions/:versionId/restore", requireVerified, async (req, res, next) => {
  try {
    const project = await ownProject(req.user!._id, req.params.id);
    if (!req.params.versionId || !mongoose.isValidObjectId(req.params.versionId)) {
      throw new HttpError(404, "Version not found");
    }
    const version = await ProjectVersion.findOne({
      _id: req.params.versionId,
      projectId: project._id,
      userId: req.user!._id,
    });
    if (!version) throw new HttpError(404, "Version not found");
    const timeline = migrateProject(version.timeline);
    project.timeline = timeline;
    project.aspect = timeline.aspect;
    project.name = timeline.name;
    project.markModified("timeline");
    await project.save();
    res.json({ project: present(project) });
  } catch (error) {
    next(error);
  }
});
