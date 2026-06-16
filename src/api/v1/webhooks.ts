import { Router } from "express";
import { z } from "zod";
import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  listWebhookDeliveries,
  listWebhooks,
  updateWebhook
} from "../../services/webhooks.service";

// For now, we simulate an authenticated user ID until Phase 5 (Auth)
const MOCK_USER_ID = "usr_123";

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1)
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).min(1).optional(),
  isActive: z.boolean().optional()
});

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const webhooksRouter = Router();

webhooksRouter.post("/", async (req, res, next) => {
  try {
    const input = createWebhookSchema.parse(req.body);
    const webhook = await createWebhook({
      ...input,
      userId: MOCK_USER_ID
    });
    res.status(201).json({ data: webhook });
  } catch (error) {
    next(error);
  }
});

webhooksRouter.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await listWebhooks({
      ...query,
      userId: MOCK_USER_ID
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

webhooksRouter.get("/:id", async (req, res, next) => {
  try {
    const webhook = await getWebhook(req.params.id, MOCK_USER_ID);
    res.status(200).json({ data: webhook });
  } catch (error) {
    next(error);
  }
});

webhooksRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = updateWebhookSchema.parse(req.body);
    const webhook = await updateWebhook(req.params.id, MOCK_USER_ID, input);
    res.status(200).json({ data: webhook });
  } catch (error) {
    next(error);
  }
});

webhooksRouter.delete("/:id", async (req, res, next) => {
  try {
    const webhook = await deleteWebhook(req.params.id, MOCK_USER_ID);
    res.status(200).json({ data: webhook });
  } catch (error) {
    next(error);
  }
});

webhooksRouter.get("/:id/deliveries", async (req, res, next) => {
  try {
    // Validate ownership first
    await getWebhook(req.params.id, MOCK_USER_ID);
    
    const query = listQuerySchema.parse(req.query);
    const result = await listWebhookDeliveries({
      ...query,
      webhookId: req.params.id
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
