import swaggerUi from "swagger-ui-express";
import { Router } from "express";
import { env } from "../config/env";

export const swaggerRouter = Router();

const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Nodeflow API",
    version: "1.0.0",
    description: "Production-grade developer workflow automation API."
  },
  servers: [
    {
      url: env.API_BASE_URL + "/v1",
      description: "API Server"
    }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description: "Bearer <your_api_key>"
      }
    }
  },
  security: [
    {
      ApiKeyAuth: []
    }
  ],
  paths: {
    "/jobs": {
      post: {
        summary: "Create a job",
        tags: ["Jobs"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  payload: { type: "object" },
                  priority: { type: "integer" },
                  maxAttempts: { type: "integer" }
                }
              }
            }
          }
        },
        responses: {
          "202": { description: "Job queued" }
        }
      },
      get: {
        summary: "List jobs",
        tags: ["Jobs"],
        responses: {
          "200": { description: "Success" }
        }
      }
    }
    // ... add more paths for a full doc later
  }
};

swaggerRouter.use("/", swaggerUi.serve);
swaggerRouter.get("/", swaggerUi.setup(swaggerDocument));
