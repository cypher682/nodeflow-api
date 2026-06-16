import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { AppError } from "../api/middleware/error-handler";
import { prisma } from "../lib/prisma";

export type CreateWebhookInput = {
  userId: string;
  url: string;
  events: string[];
};

export type UpdateWebhookInput = {
  url?: string;
  events?: string[];
  isActive?: boolean;
};

export type ListWebhooksInput = {
  userId: string;
  cursor?: string;
  limit: number;
};

export type ListWebhookDeliveriesInput = {
  webhookId: string;
  cursor?: string;
  limit: number;
};

type Cursor = {
  createdAt: string;
  id: string;
};

const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");

const decodeCursor = (cursor: string): Cursor => {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Cursor;
    if (!parsed.createdAt || !parsed.id) throw new Error("Missing fields");
    return parsed;
  } catch {
    throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
  }
};

const generateSecret = () => {
  return "whsec_" + randomBytes(32).toString("hex");
};

export const createWebhook = async (input: CreateWebhookInput) => {
  return prisma.webhook.create({
    data: {
      userId: input.userId,
      url: input.url,
      events: input.events,
      secret: generateSecret(),
    }
  });
};

export const getWebhook = async (id: string, userId: string) => {
  const webhook = await prisma.webhook.findFirst({
    where: { id, userId }
  });

  if (!webhook) {
    throw new AppError(404, "Webhook not found", "WEBHOOK_NOT_FOUND");
  }

  return webhook;
};

export const listWebhooks = async (input: ListWebhooksInput) => {
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  
  const where: Prisma.WebhookWhereInput = {
    userId: input.userId,
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

  const webhooks = await prisma.webhook.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1
  });

  const hasNextPage = webhooks.length > input.limit;
  const page = hasNextPage ? webhooks.slice(0, input.limit) : webhooks;
  const lastItem = page.at(-1);

  return {
    data: page,
    pageInfo: {
      hasNextPage,
      nextCursor:
        hasNextPage && lastItem
          ? encodeCursor({
              createdAt: lastItem.createdAt.toISOString(),
              id: lastItem.id
            })
          : null
    }
  };
};

export const updateWebhook = async (id: string, userId: string, input: UpdateWebhookInput) => {
  await getWebhook(id, userId); // Ensure exists and owned by user

  return prisma.webhook.update({
    where: { id },
    data: input
  });
};

export const deleteWebhook = async (id: string, userId: string) => {
  await getWebhook(id, userId);

  return prisma.webhook.delete({
    where: { id }
  });
};

export const dispatchEvent = async (eventType: string, payload: unknown) => {
  // Find all active webhooks subscribed to this event (or all events via '*')
  const webhooks = await prisma.webhook.findMany({
    where: {
      isActive: true,
      events: {
        hasSome: [eventType, "*"]
      }
    }
  });

  if (webhooks.length === 0) return;

  const { webhookDispatchQueue } = await import("../queues");

  // Create deliveries and enqueue them
  for (const webhook of webhooks) {
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType,
        payload: payload as Prisma.InputJsonValue
      }
    });

    await webhookDispatchQueue.add(
      "dispatch",
      {
        deliveryId: delivery.id
      },
      {
        jobId: delivery.id // Use delivery ID as BullMQ job ID for uniqueness
      }
    );
  }
};

export const listWebhookDeliveries = async (input: ListWebhookDeliveriesInput) => {
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  
  const where: Prisma.WebhookDeliveryWhereInput = {
    webhookId: input.webhookId,
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

  const deliveries = await prisma.webhookDelivery.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1
  });

  const hasNextPage = deliveries.length > input.limit;
  const page = hasNextPage ? deliveries.slice(0, input.limit) : deliveries;
  const lastItem = page.at(-1);

  return {
    data: page,
    pageInfo: {
      hasNextPage,
      nextCursor:
        hasNextPage && lastItem
          ? encodeCursor({
              createdAt: lastItem.createdAt.toISOString(),
              id: lastItem.id
            })
          : null
    }
  };
};
