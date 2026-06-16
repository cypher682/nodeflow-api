import { JobStatus, LogLevel, Prisma } from "@prisma/client";
import { AppError } from "../api/middleware/error-handler";
import { prisma } from "../lib/prisma";

export type CreateJobInput = {
  type: string;
  payload: unknown;
  priority: number;
  maxAttempts: number;
};

export type ListJobsInput = {
  cursor?: string;
  limit: number;
  status?: JobStatus;
};

type JobCursor = {
  createdAt: string;
  id: string;
};

const encodeCursor = (cursor: JobCursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");

const decodeCursor = (cursor: string): JobCursor => {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as JobCursor;

    if (!parsed.createdAt || !parsed.id) {
      throw new Error("Missing cursor fields");
    }

    return parsed;
  } catch {
    throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
  }
};

export const createJob = async (input: CreateJobInput) => {
  const job = await prisma.job.create({
    data: {
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
      priority: input.priority,
      maxAttempts: input.maxAttempts,
      logs: {
        create: {
          level: LogLevel.INFO,
          message: "Job queued",
          metadata: {
            queue: "job-processing"
          }
        }
      }
    }
  });

  const { jobProcessingQueue } = await import("../queues");
  await jobProcessingQueue.add(
    input.type,
    {
      jobId: job.id,
      payload: input.payload
    },
    {
      jobId: job.id,
      priority: input.priority,
      attempts: input.maxAttempts
    }
  );

  return job;
};

export const getJob = async (id: string) => {
  const job = await prisma.job.findUnique({
    where: { id }
  });

  if (!job) {
    throw new AppError(404, "Job not found", "JOB_NOT_FOUND");
  }

  return job;
};

export const listJobs = async (input: ListJobsInput) => {
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  const where: Prisma.JobWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            {
              createdAt: new Date(cursor.createdAt),
              id: { lt: cursor.id }
            }
          ]
        }
      : {})
  };

  const jobs = await prisma.job.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1
  });

  const hasNextPage = jobs.length > input.limit;
  const page = hasNextPage ? jobs.slice(0, input.limit) : jobs;
  const lastJob = page.at(-1);

  return {
    data: page,
    pageInfo: {
      hasNextPage,
      nextCursor:
        hasNextPage && lastJob
          ? encodeCursor({
              createdAt: lastJob.createdAt.toISOString(),
              id: lastJob.id
            })
          : null
    }
  };
};

export const cancelJob = async (id: string) => {
  const job = await getJob(id);

  if (job.status !== JobStatus.QUEUED && job.status !== JobStatus.RUNNING) {
    throw new AppError(409, `Cannot cancel job in ${job.status} state`, "JOB_NOT_CANCELABLE");
  }

  const { jobProcessingQueue } = await import("../queues");
  const queuedJob = await jobProcessingQueue.getJob(id);
  await queuedJob?.remove();

  return prisma.job.update({
    where: { id },
    data: {
      status: JobStatus.CANCELLED,
      logs: {
        create: {
          level: LogLevel.WARN,
          message: "Job cancelled by client"
        }
      }
    }
  });
};

export const getJobLogs = async (id: string) => {
  await getJob(id);

  return prisma.jobLog.findMany({
    where: { jobId: id },
    orderBy: { createdAt: "asc" }
  });
};

export const updateJobStatus = async (
  id: string,
  status: JobStatus,
  result?: unknown
) => {
  return prisma.job.update({
    where: { id },
    data: {
      status,
      ...(result ? { result: result as Prisma.InputJsonValue } : {})
    }
  });
};

export const addJobLog = async (
  jobId: string,
  level: LogLevel,
  message: string,
  metadata?: unknown
) => {
  return prisma.jobLog.create({
    data: {
      jobId,
      level,
      message,
      ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {})
    }
  });
};

export const incrementAttempts = async (id: string) => {
  return prisma.job.update({
    where: { id },
    data: {
      attempts: {
        increment: 1
      }
    }
  });
};
