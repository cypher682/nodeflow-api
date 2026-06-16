import request from "supertest";
import { createApp } from "../src/app";
import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  updateWebhook
} from "../src/services/webhooks.service";

jest.mock("../src/services/webhooks.service", () => ({
  createWebhook: jest.fn(),
  getWebhook: jest.fn(),
  listWebhooks: jest.fn(),
  updateWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
  listWebhookDeliveries: jest.fn(),
  dispatchEvent: jest.fn()
}));

const mockedCreateWebhook = jest.mocked(createWebhook);
const mockedGetWebhook = jest.mocked(getWebhook);
const mockedListWebhooks = jest.mocked(listWebhooks);
const mockedUpdateWebhook = jest.mocked(updateWebhook);
const mockedDeleteWebhook = jest.mocked(deleteWebhook);

const now = new Date();

const webhook = {
  id: "wh_123",
  userId: "usr_123",
  url: "https://example.com/webhook",
  secret: "whsec_test_secret_123",
  events: ["job.completed", "job.failed"],
  isActive: true,
  createdAt: now,
  updatedAt: now
};

describe("webhook routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a webhook", async () => {
    mockedCreateWebhook.mockResolvedValue(webhook);

    const response = await request(createApp()).post("/v1/webhooks").send({
      url: "https://example.com/webhook",
      events: ["job.completed", "job.failed"]
    });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe("wh_123");
    expect(mockedCreateWebhook).toHaveBeenCalledWith({
      userId: "usr_123",
      url: "https://example.com/webhook",
      events: ["job.completed", "job.failed"]
    });
  });

  it("gets a webhook", async () => {
    mockedGetWebhook.mockResolvedValue(webhook);

    const response = await request(createApp()).get("/v1/webhooks/wh_123");

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe("wh_123");
  });

  it("lists webhooks", async () => {
    mockedListWebhooks.mockResolvedValue({
      data: [webhook],
      pageInfo: {
        hasNextPage: false,
        nextCursor: null
      }
    });

    const response = await request(createApp()).get("/v1/webhooks");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("updates a webhook", async () => {
    mockedUpdateWebhook.mockResolvedValue({ ...webhook, isActive: false });

    const response = await request(createApp()).patch("/v1/webhooks/wh_123").send({
      isActive: false
    });

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);
  });

  it("deletes a webhook", async () => {
    mockedDeleteWebhook.mockResolvedValue(webhook);

    const response = await request(createApp()).delete("/v1/webhooks/wh_123");

    expect(response.status).toBe(200);
    expect(mockedDeleteWebhook).toHaveBeenCalledWith("wh_123", "usr_123");
  });
});
