import { Router } from "express";
import { jobsRouter } from "./jobs";
import { webhooksRouter } from "./webhooks";
import { filesRouter } from "./files";
import { apiKeysRouter } from "./api-keys";
import { idempotency } from "../middleware/idempotency";

export const v1Router = Router();

v1Router.get("/", (_req, res) => {
  res.status(200).json({
    version: "v1",
    service: "nodeflow-api",
    resources: ["jobs", "webhooks", "files", "queue", "api-keys"]
  });
});

// Apply idempotency middleware to all v1 routes
v1Router.use(idempotency);

v1Router.use("/jobs", jobsRouter);
v1Router.use("/webhooks", webhooksRouter);
v1Router.use("/files", filesRouter);
v1Router.use("/api-keys", apiKeysRouter);
