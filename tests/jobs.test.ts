import request from "supertest";
import { JobStatus, LogLevel } from "@prisma/client";
import { AppError } from "../src/api/middleware/error-handler";
import { createApp } from "../src/app";
import {
  cancelJob,
  createJob,
  getJob,
  getJobLogs,
  listJobs
} from "../src/services/jobs.service";

jest.mock("../src/services/jobs.service", () => ({
  createJob: jest.fn(),
  getJob: jest.fn(),
  listJobs: jest.fn(),
  cancelJob: jest.fn(),
  getJobLogs: jest.fn()
}));

const mockedCreateJob = jest.mocked(createJob);
const mockedGetJob = jest.mocked(getJob);
const mockedListJobs = jest.mocked(listJobs);
const mockedCancelJob = jest.mocked(cancelJob);
const mockedGetJobLogs = jest.mocked(getJobLogs);

const now = new Date("2026-06-16T12:00:00.000Z");

const job = {
  id: "job_123",
  type: "file.metadata.extract",
  payload: { fileId: "file_123" },
  status: JobStatus.QUEUED,
  priority: 4,
  attempts: 0,
  maxAttempts: 3,
  result: null,
  createdAt: now,
  updatedAt: now
};

describe("jobs routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a job and returns 202", async () => {
    mockedCreateJob.mockResolvedValue(job);

    const response = await request(createApp()).post("/v1/jobs").send({
      type: "file.metadata.extract",
      payload: { fileId: "file_123" },
      priority: 4,
      maxAttempts: 3
    });

    expect(response.status).toBe(202);
    expect(response.body.data).toMatchObject({
      id: "job_123",
      type: "file.metadata.extract",
      status: "QUEUED"
    });
    expect(mockedCreateJob).toHaveBeenCalledWith({
      type: "file.metadata.extract",
      payload: { fileId: "file_123" },
      priority: 4,
      maxAttempts: 3
    });
  });

  it("rejects invalid job payloads", async () => {
    const response = await request(createApp()).post("/v1/jobs").send({
      type: "bad type",
      payload: { fileId: "file_123" }
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedCreateJob).not.toHaveBeenCalled();
  });

  it("lists jobs with cursor pagination metadata", async () => {
    mockedListJobs.mockResolvedValue({
      data: [job],
      pageInfo: {
        hasNextPage: false,
        nextCursor: null
      }
    });

    const response = await request(createApp()).get("/v1/jobs?limit=10&status=QUEUED");

    expect(response.status).toBe(200);
    expect(response.body.pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null
    });
    expect(mockedListJobs).toHaveBeenCalledWith({
      limit: 10,
      status: "QUEUED"
    });
  });

  it("gets a job by id", async () => {
    mockedGetJob.mockResolvedValue(job);

    const response = await request(createApp()).get("/v1/jobs/job_123");

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe("job_123");
    expect(mockedGetJob).toHaveBeenCalledWith("job_123");
  });

  it("returns a not found error when a job is missing", async () => {
    mockedGetJob.mockRejectedValue(new AppError(404, "Job not found", "JOB_NOT_FOUND"));

    const response = await request(createApp()).get("/v1/jobs/missing");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("JOB_NOT_FOUND");
  });

  it("cancels a queued job", async () => {
    mockedCancelJob.mockResolvedValue({
      ...job,
      status: JobStatus.CANCELLED
    });

    const response = await request(createApp()).delete("/v1/jobs/job_123");

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("CANCELLED");
    expect(mockedCancelJob).toHaveBeenCalledWith("job_123");
  });

  it("returns conflict when a job cannot be cancelled", async () => {
    mockedCancelJob.mockRejectedValue(
      new AppError(409, "Cannot cancel job in SUCCEEDED state", "JOB_NOT_CANCELABLE")
    );

    const response = await request(createApp()).delete("/v1/jobs/job_123");

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("JOB_NOT_CANCELABLE");
  });

  it("lists job logs", async () => {
    mockedGetJobLogs.mockResolvedValue([
      {
        id: "log_123",
        jobId: "job_123",
        level: LogLevel.INFO,
        message: "Job queued",
        metadata: null,
        createdAt: now
      }
    ]);

    const response = await request(createApp()).get("/v1/jobs/job_123/logs");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      jobId: "job_123",
      level: "INFO",
      message: "Job queued"
    });
    expect(mockedGetJobLogs).toHaveBeenCalledWith("job_123");
  });
});
