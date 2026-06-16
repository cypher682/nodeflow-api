import { Server } from "socket.io";
import { createServer, Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { setupSocketServer } from "../src/socket";

describe("WebSocket Real-Time Updates", () => {
  let io: Server;
  let clientSocket: ClientSocket;
  let httpServer: HttpServer;
  let port: number;

  beforeAll((done) => {
    httpServer = createServer();
    // Use a random port
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      io = setupSocketServer(httpServer);
      done();
    });
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  beforeEach((done) => {
    clientSocket = Client(`http://localhost:${port}`);
    clientSocket.on("connect", done);
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it("should allow a client to subscribe to a job", (done) => {
    clientSocket.emit("subscribe", "job_123");
    clientSocket.on("subscribed", (data) => {
      expect(data.jobId).toBe("job_123");
      done();
    });
  });

  it("should allow a client to unsubscribe from a job", (done) => {
    clientSocket.emit("unsubscribe", "job_123");
    clientSocket.on("unsubscribed", (data) => {
      expect(data.jobId).toBe("job_123");
      done();
    });
  });

  it("should receive events emitted to a subscribed job", (done) => {
    clientSocket.emit("subscribe", "job_123");

    clientSocket.on("subscribed", () => {
      // Simulate emitting from server (bypassing Redis adapter in test environment)
      io.to("job:job_123").emit("job:status", {
        jobId: "job_123",
        status: "RUNNING",
        timestamp: new Date().toISOString()
      });
    });

    clientSocket.on("job:status", (data) => {
      expect(data.jobId).toBe("job_123");
      expect(data.status).toBe("RUNNING");
      expect(data.timestamp).toBeDefined();
      done();
    });
  });
});
