import { getJobHandler, jobHandlers } from "../src/workers/job-handlers";
import { logger } from "../src/lib/logger";

jest.mock("../src/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe("Job Handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getJobHandler", () => {
    it("returns specific handler for known type", () => {
      const handler = getJobHandler("file.metadata.extract");
      expect(handler).toBe(jobHandlers["file.metadata.extract"]);
    });

    it("returns generic fallback handler for unknown type", async () => {
      const handler = getJobHandler("unknown.type");
      expect(handler).toBeDefined();
      expect(handler).not.toBe(jobHandlers["file.metadata.extract"]);

      const result = await handler({ foo: "bar" });
      
      expect(logger.warn).toHaveBeenCalledWith(
        "No specific handler found for job type: unknown.type, using generic handler"
      );
      
      expect(result).toEqual({
        processed: true,
        note: "Processed by generic fallback handler"
      });
    });
  });

  describe("simulate real handlers", () => {
    it("processes file.metadata.extract", async () => {
      const handler = getJobHandler("file.metadata.extract");
      const result = await handler({ fileId: "123" });
      
      expect(result).toEqual(expect.objectContaining({
        extracted: true,
        mimeType: "application/pdf"
      }));
    });
  });
});
