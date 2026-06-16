import { Router } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../middleware/error-handler";
import { requireApiKey } from "../middleware/auth";

export const apiKeysRouter = Router();

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(365).optional()
});

// Create a new API key (Returns the raw key ONCE)
// Require auth so only existing users can create keys (in a real app this would be session/cookie auth)
apiKeysRouter.post("/", requireApiKey, async (req, res, next) => {
  try {
    const input = createApiKeySchema.parse(req.body);
    
    // Generate a random 32-character hex key
    const rawKey = (await import("node:crypto")).randomBytes(16).toString("hex");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    let expiresAt: Date | undefined;
    if (input.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        userId: req.userId!,
        name: input.name,
        keyHash,
        expiresAt
      }
    });

    res.status(201).json({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey, // ONLY RETURNED ONCE!
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// List keys (masked)
apiKeysRouter.get("/", requireApiKey, async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.userId },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json({ data: keys });
  } catch (error) {
    next(error);
  }
});

// Revoke a key
apiKeysRouter.delete("/:id", requireApiKey, async (req, res, next) => {
  try {
    const key = await prisma.apiKey.findFirst({
      where: { id: String(req.params.id), userId: req.userId! }
    });

    if (!key) {
      throw new AppError(404, "API Key not found", "KEY_NOT_FOUND");
    }

    await prisma.apiKey.delete({
      where: { id: String(req.params.id) }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});
