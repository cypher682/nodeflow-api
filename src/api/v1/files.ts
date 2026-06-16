import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../../api/middleware/error-handler";
import {
  deleteFile,
  downloadFile,
  getFile,
  listFiles,
  uploadFile
} from "../../services/files.service";

const MOCK_USER_ID = "usr_123";

// Configure Multer for memory storage (we'll process and save it in the service)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const filesRouter = Router();

filesRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, "No file uploaded", "FILE_REQUIRED");
    }

    const file = await uploadFile({
      userId: MOCK_USER_ID,
      originalName: req.file.originalname,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

    res.status(202).json({ data: file });
  } catch (error) {
    next(error);
  }
});

filesRouter.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await listFiles({
      ...query,
      userId: MOCK_USER_ID
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

filesRouter.get("/:id", async (req, res, next) => {
  try {
    const file = await getFile(req.params.id, MOCK_USER_ID);
    res.status(200).json({ data: file });
  } catch (error) {
    next(error);
  }
});

filesRouter.delete("/:id", async (req, res, next) => {
  try {
    const file = await deleteFile(req.params.id, MOCK_USER_ID);
    res.status(200).json({ data: file });
  } catch (error) {
    next(error);
  }
});

filesRouter.get("/:id/download", async (req, res, next) => {
  try {
    const { buffer, mimeType, originalName, size } = await downloadFile(req.params.id, MOCK_USER_ID);
    
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${originalName}"`);
    res.setHeader("Content-Length", size.toString());
    
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
});
