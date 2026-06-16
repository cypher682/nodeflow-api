import request from "supertest";
import { FileStatus } from "@prisma/client";
import { createApp } from "../src/app";
import {
  deleteFile,
  downloadFile,
  getFile,
  listFiles,
  uploadFile
} from "../src/services/files.service";

jest.mock("../src/services/files.service", () => ({
  uploadFile: jest.fn(),
  getFile: jest.fn(),
  listFiles: jest.fn(),
  deleteFile: jest.fn(),
  downloadFile: jest.fn()
}));

const mockedUploadFile = jest.mocked(uploadFile);
const mockedGetFile = jest.mocked(getFile);
const mockedListFiles = jest.mocked(listFiles);
const mockedDeleteFile = jest.mocked(deleteFile);
const mockedDownloadFile = jest.mocked(downloadFile);

const now = new Date();

const fileData = {
  id: "file_123",
  userId: "usr_123",
  originalName: "test.txt",
  s3Key: "usr_123/uuid.txt",
  size: 13,
  mimeType: "text/plain",
  status: FileStatus.READY,
  metadata: null,
  createdAt: now,
  updatedAt: now
};

describe("file routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads a file", async () => {
    mockedUploadFile.mockResolvedValue(fileData);

    const response = await request(createApp())
      .post("/v1/files")
      .attach("file", Buffer.from("Hello, world!"), "test.txt");

    expect(response.status).toBe(202);
    expect(response.body.data.id).toBe("file_123");
    expect(mockedUploadFile).toHaveBeenCalledWith({
      userId: "usr_123",
      originalName: "test.txt",
      buffer: expect.any(Buffer),
      mimeType: "text/plain",
      size: 13
    });
  });

  it("gets file metadata", async () => {
    mockedGetFile.mockResolvedValue(fileData);

    const response = await request(createApp()).get("/v1/files/file_123");

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe("file_123");
  });

  it("lists files", async () => {
    mockedListFiles.mockResolvedValue({
      data: [fileData],
      pageInfo: {
        hasNextPage: false,
        nextCursor: null
      }
    });

    const response = await request(createApp()).get("/v1/files");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("deletes a file", async () => {
    mockedDeleteFile.mockResolvedValue({ ...fileData, status: FileStatus.DELETED });

    const response = await request(createApp()).delete("/v1/files/file_123");

    expect(response.status).toBe(200);
    expect(mockedDeleteFile).toHaveBeenCalledWith("file_123", "usr_123");
  });

  it("downloads a file", async () => {
    mockedDownloadFile.mockResolvedValue({
      buffer: Buffer.from("Hello, world!"),
      mimeType: "text/plain",
      originalName: "test.txt",
      size: 13
    });

    const response = await request(createApp()).get("/v1/files/file_123/download");

    expect(response.status).toBe(200);
    expect(response.header["content-type"]).toBe("text/plain");
    expect(response.header["content-disposition"]).toBe('attachment; filename="test.txt"');
    expect(response.text).toBe("Hello, world!");
  });
});
