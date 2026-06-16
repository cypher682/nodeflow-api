import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { logger } from "./logger";

export interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), "uploads");
    // Ensure uploads directory exists
    fs.mkdir(this.baseDir, { recursive: true }).catch((err) => {
      logger.error("Failed to create uploads directory", { error: err });
    });
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    // Ensure subdirectories exist if key contains them
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, key);
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new Error("File not found");
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw error; // Ignore if already deleted
      }
    }
  }
}

export class S3StorageProvider implements StorageProvider {
  async upload(_key: string, _buffer: Buffer, _mimeType: string): Promise<string> {
    throw new Error("S3StorageProvider not implemented yet");
  }

  async download(_key: string): Promise<Buffer> {
    throw new Error("S3StorageProvider not implemented yet");
  }

  async delete(_key: string): Promise<void> {
    throw new Error("S3StorageProvider not implemented yet");
  }
}

export const createStorageProvider = (): StorageProvider => {
  const providerType = env.STORAGE_PROVIDER || "local";
  
  if (providerType === "s3") {
    return new S3StorageProvider();
  }
  
  return new LocalStorageProvider();
};

export const storage = createStorageProvider();
