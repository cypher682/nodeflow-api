import { FileStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppError } from "../api/middleware/error-handler";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";

export type UploadFileInput = {
  userId: string;
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
};

export type ListFilesInput = {
  userId: string;
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

export const uploadFile = async (input: UploadFileInput) => {
  // Generate a unique S3 key (storage path)
  const extension = input.originalName.split(".").pop();
  const s3Key = `${input.userId}/${randomUUID()}.${extension}`;

  // Upload to storage provider
  await storage.upload(s3Key, input.buffer, input.mimeType);

  // Create DB record
  const file = await prisma.file.create({
    data: {
      userId: input.userId,
      originalName: input.originalName,
      s3Key,
      size: input.size,
      mimeType: input.mimeType,
      status: FileStatus.UPLOADED
    }
  });

  // Enqueue file processing job
  const { fileProcessingQueue } = await import("../queues");
  await fileProcessingQueue.add(
    "file.process",
    { fileId: file.id },
    { jobId: `file_process_${file.id}` }
  );

  return file;
};

export const getFile = async (id: string, userId: string) => {
  const file = await prisma.file.findFirst({
    where: { id, userId }
  });

  if (!file || file.status === FileStatus.DELETED) {
    throw new AppError(404, "File not found", "FILE_NOT_FOUND");
  }

  return file;
};

export const listFiles = async (input: ListFilesInput) => {
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  
  const where: Prisma.FileWhereInput = {
    userId: input.userId,
    status: { not: FileStatus.DELETED },
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

  const files = await prisma.file.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1
  });

  const hasNextPage = files.length > input.limit;
  const page = hasNextPage ? files.slice(0, input.limit) : files;
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

export const deleteFile = async (id: string, userId: string) => {
  const file = await getFile(id, userId);

  // Soft delete in DB
  const deletedFile = await prisma.file.update({
    where: { id },
    data: { status: FileStatus.DELETED }
  });

  // Schedule cleanup from storage (we can use the cleanup queue for this later, 
  // but for now we'll delete it immediately)
  try {
    await storage.delete(file.s3Key);
  } catch (error) {
    // Log but don't fail the request if storage deletion fails
    const { logger } = await import("../lib/logger");
    logger.error("Failed to delete file from storage", { fileId: id, s3Key: file.s3Key, error });
  }

  return deletedFile;
};

export const downloadFile = async (id: string, userId: string) => {
  const file = await getFile(id, userId);
  
  if (file.status !== FileStatus.READY) {
    throw new AppError(400, "File is not ready for download", "FILE_NOT_READY");
  }

  const buffer = await storage.download(file.s3Key);
  
  return {
    buffer,
    mimeType: file.mimeType,
    originalName: file.originalName,
    size: file.size
  };
};

export const updateFileStatus = async (id: string, status: FileStatus, metadata?: unknown) => {
  return prisma.file.update({
    where: { id },
    data: {
      status,
      ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {})
    }
  });
};
