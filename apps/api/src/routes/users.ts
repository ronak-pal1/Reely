import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { publicUser } from "../services/users.js";

export const userRouter = Router();

userRouter.get("/me", requireUser, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

userRouter.patch("/me", requireUser, async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    req.user!.name = body.name;
    await req.user!.save();
    res.json({ user: publicUser(req.user!) });
  } catch (error) {
    next(error);
  }
});
