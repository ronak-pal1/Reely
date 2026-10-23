import { Router } from "express";
import mongoose from "mongoose";
import { migrateProject } from "@reelio/timeline-schema";
import { HttpError } from "../middleware/error.js";
import { Template } from "../models.js";
import { ensureTemplates } from "../services/templates.js";

export const templateRouter = Router();

templateRouter.get("/", async (_req, res, next) => {
  try {
    await ensureTemplates();
    const templates = await Template.find().sort({ name: 1 });
    res.json({
      templates: templates.map((template) => ({
        id: String(template._id),
        slug: template.slug,
        name: template.name,
        description: template.description,
        category: template.category,
        aspect: template.aspect,
      })),
    });
  } catch (error) {
    next(error);
  }
});

templateRouter.get("/:id", async (req, res, next) => {
  try {
    if (!req.params.id || !mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(404, "Template not found");
    }
    const template = await Template.findById(req.params.id);
    if (!template) throw new HttpError(404, "Template not found");
    res.json({
      template: {
        id: String(template._id),
        slug: template.slug,
        name: template.name,
        description: template.description,
        category: template.category,
        aspect: template.aspect,
        timeline: migrateProject(template.timeline),
      },
    });
  } catch (error) {
    next(error);
  }
});
