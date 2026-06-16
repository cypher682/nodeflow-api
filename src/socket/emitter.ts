import { Emitter } from "@socket.io/redis-emitter";
import { JobStatus } from "@prisma/client";
import { createRedisClient } from "../lib/redis";
import { logger } from "../lib/logger";

let emitter: Emitter | null = null;

export const getEmitter = () => {
  if (!emitter) {
    const redisClient = createRedisClient();
    emitter = new Emitter(redisClient);
  }
  return emitter;
};

export const emitJobUpdate = (
  jobId: string,
  status: JobStatus,
  result?: unknown
) => {
  try {
    const io = getEmitter();
    io.to(`job:${jobId}`).emit("job:status", {
      jobId,
      status,
      ...(result ? { result } : {}),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Failed to emit job update", { jobId, status, error });
  }
};
