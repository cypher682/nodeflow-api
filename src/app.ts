import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { notFoundHandler } from "./api/middleware/error-handler";
import { healthRouter } from "./api/routes/health";
import { v1Router } from "./api/v1";
import { logger } from "./lib/logger";
import { apiVersion } from "./api/middleware/api-version";
import { rateLimiter } from "./api/middleware/rate-limiter";
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { jobProcessingQueue, webhookDispatchQueue, fileProcessingQueue } from "./queues";
import { swaggerRouter } from "./api/swagger";

export const createApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    morgan("combined", {
      stream: {
        write: (message) => logger.http(message.trim())
      }
    })
  );

  app.use(apiVersion);
  
  // Rate limiter for API routes
  app.use("/v1", rateLimiter(100, 60)); // 100 requests per minute

  // Bull Board Dashboard
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(jobProcessingQueue),
      new BullMQAdapter(webhookDispatchQueue),
      new BullMQAdapter(fileProcessingQueue)
    ],
    serverAdapter: serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());

  // Swagger Documentation
  app.use("/docs", swaggerRouter);

  app.use(healthRouter);
  app.use("/v1", v1Router);

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found"
      }
    });
  });

  app.use(notFoundHandler);

  return app;
};
