import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { createHash } from "node:crypto";
import { createRedisClient } from "../src/lib/redis";

jest.mock("../src/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn()
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn()
    }
  }
}));

jest.mock("../src/lib/redis", () => ({
  createRedisClient: jest.fn().mockReturnValue({
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn()
  }),
  createBullMqConnectionOptions: jest.fn().mockReturnValue({
    host: "localhost",
    port: 6379
  })
}));

const mockRedisClient = createRedisClient() as jest.Mocked<ReturnType<typeof createRedisClient>>;

describe("Cross-cutting middlewares", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.incr.mockResolvedValue(1);
  });

  describe("API Version Header", () => {
    it("should include API version headers", async () => {
      const response = await request(createApp()).get("/health");
      expect(response.headers["x-api-version"]).toBe("v1");
      expect(response.headers["x-deprecated"]).toBe("false");
    });
  });

  describe("Rate Limiter", () => {
    it("should allow requests under the limit", async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      
      const response = await request(createApp()).get("/v1");
      
      expect(response.status).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBe("100");
      expect(response.headers["x-ratelimit-remaining"]).toBe("99");
    });

    it("should reject requests over the limit", async () => {
      mockRedisClient.incr.mockResolvedValue(101);
      mockRedisClient.ttl.mockResolvedValue(30);
      
      const response = await request(createApp()).get("/v1");
      
      expect(response.status).toBe(429);
      expect(response.headers["retry-after"]).toBe("30");
      expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });

  describe("API Keys Authentication", () => {
    const rawKey = "test_key_123";
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    
    const validKey = {
      id: "key_1",
      userId: "usr_123",
      keyHash,
      name: "Test Key",
      expiresAt: null
    };

    it("should reject requests without api key", async () => {
      const response = await request(createApp()).get("/v1/api-keys");
      expect(response.status).toBe(401);
    });

    it("should reject requests with invalid api key", async () => {
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);
      
      const response = await request(createApp())
        .get("/v1/api-keys")
        .set("Authorization", "Bearer invalid_key");
        
      expect(response.status).toBe(401);
    });

    it("should allow requests with valid api key", async () => {
      (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(validKey);
      (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([validKey]);
      (prisma.apiKey.update as jest.Mock).mockResolvedValue(validKey);
      
      const response = await request(createApp())
        .get("/v1/api-keys")
        .set("Authorization", `Bearer ${rawKey}`);
        
      expect(response.status).toBe(200);
      expect(prisma.apiKey.update).toHaveBeenCalled(); // Should update lastUsedAt
    });
  });
  
  describe("Idempotency", () => {
    it("should cache and return previous response for same idempotency key", async () => {
      (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({
        responseStatus: 202,
        responseBody: { cached: true }
      });
      
      const response = await request(createApp())
        .post("/v1/jobs") // State mutating route
        .set("Idempotency-Key", "idemp_123")
        .send({ type: "test", payload: {} });
        
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ cached: true });
    });
  });
});
