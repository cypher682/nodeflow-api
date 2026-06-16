import { logger } from "../lib/logger";

type JobHandler = (payload: unknown) => Promise<unknown>;

const simulateDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const jobHandlers: Record<string, JobHandler> = {
  "file.metadata.extract": async (payload) => {
    logger.debug("Running file.metadata.extract handler", { payload });
    await simulateDelay(1500); // Simulate processing time
    
    // Simulate successful extraction
    return {
      extracted: true,
      mimeType: "application/pdf",
      size: 1048576,
      pages: 12,
      author: "Nodeflow System"
    };
  },
  
  "data.transform": async (payload) => {
    logger.debug("Running data.transform handler", { payload });
    await simulateDelay(1000);
    
    return {
      transformed: true,
      recordsProcessed: 42,
      durationMs: 1000
    };
  },
  
  "report.generate": async (payload) => {
    logger.debug("Running report.generate handler", { payload });
    await simulateDelay(2500);
    
    return {
      generated: true,
      reportUrl: "https://example.com/reports/123.pdf",
      size: 45000
    };
  }
};

export const getJobHandler = (type: string): JobHandler => {
  const handler = jobHandlers[type];
  
  if (handler) {
    return handler;
  }
  
  // Generic fallback handler for unknown types
  return async (_payload) => {
    logger.warn(`No specific handler found for job type: ${type}, using generic handler`);
    await simulateDelay(500);
    return {
      processed: true,
      note: "Processed by generic fallback handler"
    };
  };
};
