import { Request, Response, NextFunction } from "express";
import { createRedisClient } from "../../lib/redis";
import { AppError } from "./error-handler";

const redis = createRedisClient();

export const rateLimiter = (limit: number, windowSeconds: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use userId if authenticated, else fallback to IP
      const identifier = req.userId || req.ip || "unknown";
      
      // Use a distinct key per endpoint to allow different limits
      // Or fallback to a generic api prefix
      const routePrefix = req.baseUrl || "/api";
      const key = `ratelimit:${routePrefix}:${identifier}`;

      const current = await redis.incr(key);
      
      if (current === 1) {
        // First request in the window, set expiration
        await redis.expire(key, windowSeconds);
      }

      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - current));

      if (current > limit) {
        const ttl = await redis.ttl(key);
        res.setHeader("Retry-After", ttl > 0 ? ttl : windowSeconds);
        throw new AppError(429, "Too many requests", "RATE_LIMIT_EXCEEDED");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
