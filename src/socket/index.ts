import { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { createRedisClient } from "../lib/redis";

export const setupSocketServer = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true
    }
  });

  // Setup Redis Adapter for cross-process event emitting
  const pubClient = createRedisClient();
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  io.on("connection", (socket) => {
    logger.debug("Socket connected", { socketId: socket.id });

    // Client requests to subscribe to updates for a specific job
    socket.on("subscribe", (jobId: string) => {
      const room = `job:${jobId}`;
      socket.join(room);
      logger.debug("Socket subscribed to job", { socketId: socket.id, jobId });
      socket.emit("subscribed", { jobId });
    });

    socket.on("unsubscribe", (jobId: string) => {
      const room = `job:${jobId}`;
      socket.leave(room);
      logger.debug("Socket unsubscribed from job", { socketId: socket.id, jobId });
      socket.emit("unsubscribed", { jobId });
    });

    socket.on("disconnect", () => {
      logger.debug("Socket disconnected", { socketId: socket.id });
    });
  });

  return io;
};
