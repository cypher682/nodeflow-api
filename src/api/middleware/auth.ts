import { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { AppError } from "./error-handler";
import { prisma } from "../../lib/prisma";

export const requireApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or invalid authorization header", "UNAUTHORIZED");
    }

    const key = authHeader.substring(7);
    const keyHash = createHash("sha256").update(key).digest("hex");

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash }
    });

    if (!apiKey) {
      throw new AppError(401, "Invalid API key", "UNAUTHORIZED");
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new AppError(401, "API key has expired", "UNAUTHORIZED");
    }

    // Attach userId to request for downstream handlers
    req.userId = apiKey.userId;

    // Update last used asynchronously
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    }).catch(err => {
      // Don't fail the request if updating lastUsedAt fails
      console.error("Failed to update lastUsedAt for API key", err);
    });

    next();
  } catch (error) {
    next(error);
  }
};
