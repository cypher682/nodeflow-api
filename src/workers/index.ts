import { JobStatus, LogLevel, WebhookDeliveryStatus, FileStatus } from "@prisma/client";
import { createHmac } from "node:crypto";
import { Worker } from "bullmq";
import { createBullMqConnectionOptions } from "../lib/redis";
import { logger } from "../lib/logger";
import { queueNames } from "../queues/names";
import { getJobHandler } from "./job-handlers";
import { emitJobUpdate } from "../socket/emitter";
import { dispatchEvent } from "../services/webhooks.service";
import { circuitBreaker } from "../lib/circuit-breaker";
import { prisma } from "../lib/prisma";
import { updateFileStatus } from "../services/files.service";
import { 
  addJobLog, 
  incrementAttempts, 
  updateJobStatus 
} from "../services/jobs.service";

const connection = createBullMqConnectionOptions();

const workers = [
  new Worker(
    queueNames.jobProcessing,
    async (job) => {
      const jobId = job.data.jobId;
      const type = job.name;
      
      try {
        // 1. Mark as RUNNING
        await updateJobStatus(jobId, JobStatus.RUNNING);
        await addJobLog(jobId, LogLevel.INFO, "Processing started");
        emitJobUpdate(jobId, JobStatus.RUNNING);
        logger.info("Processing workflow job", { jobId, type });

        // 2. Dispatch to handler
        const handler = getJobHandler(type);
        const result = await handler(job.data.payload);

        // 3. Mark as SUCCEEDED
        await updateJobStatus(jobId, JobStatus.SUCCEEDED, result);
        await addJobLog(jobId, LogLevel.INFO, "Processing completed successfully");
        emitJobUpdate(jobId, JobStatus.SUCCEEDED, result);
        
        // Dispatch webhook
        await dispatchEvent("job.completed", { jobId, status: JobStatus.SUCCEEDED, result });

        return result;
      } catch (error) {
        logger.error("Job processing error", { jobId, type, error });
        
        // 4. Handle Failure
        const dbJob = await incrementAttempts(jobId);
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        await addJobLog(jobId, LogLevel.ERROR, "Processing failed", { 
          error: errorMessage,
          attempt: dbJob.attempts,
          maxAttempts: dbJob.maxAttempts
        });

        if (dbJob.attempts >= dbJob.maxAttempts) {
          await updateJobStatus(jobId, JobStatus.FAILED);
          await addJobLog(jobId, LogLevel.ERROR, "Max attempts reached, marking as permanently failed");
          emitJobUpdate(jobId, JobStatus.FAILED);
          
          // Dispatch webhook
          await dispatchEvent("job.failed", { jobId, status: JobStatus.FAILED, error: errorMessage });
        }
        
        throw error; // Re-throw so BullMQ knows it failed and handles retries
      }
    },
    { connection, concurrency: 5 }
  ),
  new Worker(
    queueNames.webhookDispatch,
    async (job) => {
      const { deliveryId } = job.data;
      
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: { webhook: true }
      });

      if (!delivery || !delivery.webhook.isActive) {
        logger.debug("Skipping webhook delivery - not found or inactive", { deliveryId });
        return;
      }

      const { webhook } = delivery;

      // Circuit Breaker check
      if (await circuitBreaker.isCircuitOpen(webhook.url)) {
        logger.warn("Circuit open, failing delivery immediately", { deliveryId, url: webhook.url });
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: WebhookDeliveryStatus.FAILED }
        });
        return;
      }

      // Generate HMAC-SHA256 signature
      const payloadString = JSON.stringify(delivery.payload);
      const signature = createHmac("sha256", webhook.secret)
        .update(payloadString)
        .digest("hex");

      try {
        const fetch = (await import("node-fetch")).default;
        
        logger.info("Dispatching webhook", { deliveryId, url: webhook.url });
        
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Nodeflow-Signature": `sha256=${signature}`,
            "X-Nodeflow-Event": delivery.eventType,
            "X-Nodeflow-Delivery-Id": deliveryId
          },
          body: payloadString
        });

        const responseText = await response.text();
        const responseBody = responseText.substring(0, 1000); // Truncate long responses

        if (response.ok) {
          await circuitBreaker.recordSuccess(webhook.url);
          
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: WebhookDeliveryStatus.DELIVERED,
              responseCode: response.status,
              responseBody
            }
          });
          logger.info("Webhook delivered", { deliveryId, status: response.status });
        } else {
          throw new Error(`HTTP Error ${response.status}`);
        }
      } catch (error) {
        // Record failure and see if circuit breaker opens
        await circuitBreaker.recordFailure(webhook.url);
        
        const attempts = delivery.attempts + 1;
        const maxAttempts = 5;
        
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempts >= maxAttempts) {
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: WebhookDeliveryStatus.FAILED,
              attempts,
              responseBody: errorMessage
            }
          });
          logger.error("Webhook max attempts reached", { deliveryId, error: errorMessage });
        } else {
          // Exponential backoff: 2s, 4s, 8s, 16s...
          const nextRetryAt = new Date(Date.now() + Math.pow(2, attempts) * 1000);
          
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: WebhookDeliveryStatus.RETRYING,
              attempts,
              nextRetryAt,
              responseBody: errorMessage
            }
          });
          logger.warn("Webhook delivery failed, retrying", { deliveryId, attempt: attempts, nextRetryAt });
          throw error; // Re-throw to trigger BullMQ retry
        }
      }
    },
    { connection, concurrency: 10 }
  ),
  new Worker(
    queueNames.fileProcessing,
    async (job) => {
      const { fileId } = job.data;
      
      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file || file.status === FileStatus.DELETED) {
        logger.debug("Skipping file processing - not found or deleted", { fileId });
        return;
      }

      try {
        await updateFileStatus(fileId, FileStatus.PROCESSING);
        logger.info("Processing uploaded file", { fileId, s3Key: file.s3Key });

        // Simulate metadata extraction based on mime type
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const metadata = {
          extractedAt: new Date().toISOString(),
          isImage: file.mimeType.startsWith("image/"),
          dimensions: file.mimeType.startsWith("image/") ? "1024x768" : null,
          pages: file.mimeType === "application/pdf" ? 12 : null
        };

        const updatedFile = await updateFileStatus(fileId, FileStatus.READY, metadata);
        
        logger.info("File processing completed", { fileId });
        
        // Dispatch webhook
        await dispatchEvent("file.processed", { 
          fileId, 
          status: FileStatus.READY, 
          metadata 
        });
        
        return updatedFile;
      } catch (error) {
        logger.error("File processing failed", { fileId, error });
        
        await updateFileStatus(fileId, FileStatus.FAILED);
        
        // Dispatch webhook
        await dispatchEvent("file.failed", { 
          fileId, 
          status: FileStatus.FAILED, 
          error: error instanceof Error ? error.message : String(error)
        });
        
        throw error;
      }
    },
    { connection, concurrency: 3 }
  )
];

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    logger.error("Worker job failed", {
      queueName: worker.name,
      jobId: job?.id,
      error: error.message
    });
  });
}

logger.info("Nodeflow workers started", { queues: Object.values(queueNames) });
