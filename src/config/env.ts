import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1).default("postgresql://nodeflow:nodeflow@localhost:5432/nodeflow"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local")
});

export const env = envSchema.parse(process.env);
