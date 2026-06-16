import { Router } from "express";
import { z } from "zod";
import {
  cancelJob,
  createJob,
  getJob,
  getJobLogs,
  listJobs
} from "../../services/jobs.service";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);

const createJobSchema = z.object({
  type: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-zA-Z0-9._:-]+$/),
  payload: jsonValueSchema,
  priority: z.number().int().min(1).max(10).default(5),
  maxAttempts: z.number().int().min(1).max(10).default(3)
});

const listJobsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]).optional()
});

export const jobsRouter = Router();

jobsRouter.post("/", async (req, res, next) => {
  try {
    const input = createJobSchema.parse(req.body);
    const job = await createJob(input);
    res.status(202).json({ data: job });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/", async (req, res, next) => {
  try {
    const query = listJobsQuerySchema.parse(req.query);
    const result = await listJobs(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const job = await getJob(req.params.id);
    res.status(200).json({ data: job });
  } catch (error) {
    next(error);
  }
});

jobsRouter.delete("/:id", async (req, res, next) => {
  try {
    const job = await cancelJob(req.params.id);
    res.status(200).json({ data: job });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/:id/logs", async (req, res, next) => {
  try {
    const logs = await getJobLogs(req.params.id);
    res.status(200).json({ data: logs });
  } catch (error) {
    next(error);
  }
});
