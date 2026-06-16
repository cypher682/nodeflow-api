import http from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { setupSocketServer } from "./socket";

const app = createApp();
const server = http.createServer(app);

setupSocketServer(server);

server.listen(env.PORT, () => {
  logger.info("Nodeflow API listening", {
    port: env.PORT,
    environment: env.NODE_ENV
  });
});

const shutdown = (signal: string) => {
  logger.info("Shutdown signal received", { signal });
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
