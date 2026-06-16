import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export const idempotency = async (req: Request, res: Response, next: NextFunction) => {
  // Only apply to state-mutating requests
  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "PUT") {
    return next();
  }

  const idempotencyKey = req.headers["idempotency-key"] as string;

  if (!idempotencyKey) {
    return next();
  }

  const userId = req.userId || "anonymous";

  try {
    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId: {
          key: idempotencyKey,
          userId
        }
      }
    });

    if (existing) {
      // Return cached response
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }

    // Capture the response
    const originalJson = res.json.bind(res);

    res.json = (body: unknown): Response => {
      // Execute original JSON
      const result = originalJson(body);
      
      // Store it asynchronously
      // Only store successful responses (2xx) or specific client errors
      if (res.statusCode >= 200 && res.statusCode < 500) {
        prisma.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            userId,
            responseStatus: res.statusCode,
            responseBody: body as Prisma.InputJsonValue
          }
        }).catch(err => {
          console.error("Failed to store idempotency key response", err);
        });
      }

      return result;
    };

    next();
  } catch (error) {
    next(error);
  }
};
