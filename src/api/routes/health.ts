import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "nodeflow-api",
    uptimeSeconds: Math.round(process.uptime())
  });
});
