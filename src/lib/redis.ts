import IORedis from "ioredis";
import { env } from "../config/env";

export const createRedisClient = () =>
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });

export const createBullMqConnectionOptions = () => {
  const redisUrl = new URL(env.REDIS_URL);

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname ? Number(redisUrl.pathname.replace("/", "")) || 0 : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
};
