import { Router } from "express";
import { jobsRouter } from "./jobs";
import { webhooksRouter } from "./webhooks";
import { filesRouter } from "./files";
import { apiKeysRouter } from "./api-keys";
import { idempotency } from "../middleware/idempotency";
import { prisma } from "../../lib/prisma";
export const v1Router = Router();

v1Router.get("/", (_req, res) => {
  res.status(200).json({
    version: "v1",
    service: "nodeflow-api",
    resources: ["jobs", "webhooks", "files", "queue", "api-keys"]
  });
});

// Development self-bootstrapping route
v1Router.post("/bootstrap", async (req, res, next) => {
  try {
    const { createHash, randomBytes } = await import("node:crypto");
    const rawKey = "nodeflow_test_key_" + randomBytes(8).toString("hex");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const userId = "usr_dev_123";

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: "Demo UI Auto-Key",
        keyHash
      }
    });

    res.status(201).json({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        createdAt: apiKey.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Apply idempotency middleware to all v1 routes
v1Router.use(idempotency);

v1Router.use("/jobs", jobsRouter);
v1Router.use("/webhooks", webhooksRouter);
v1Router.use("/files", filesRouter);
v1Router.use("/api-keys", apiKeysRouter);
