import { Router } from "express";
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
