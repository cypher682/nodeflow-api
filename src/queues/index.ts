import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../lib/redis";
import { queueNames } from "./names";

const connection = createBullMqConnectionOptions();

export const jobProcessingQueue = new Queue(queueNames.jobProcessing, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000
    },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

export const webhookDispatchQueue = new Queue(queueNames.webhookDispatch, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000
    },
    removeOnComplete: 1000,
    removeOnFail: false
  }
});

export const fileProcessingQueue = new Queue(queueNames.fileProcessing, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1500
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
});
