# NodeFlow API

A production-grade **developer workflow automation API** — built as an F4-level portfolio project to showcase backend, DevOps, and systems design skills.

[![CI/CD](https://github.com/your-org/nodeflow-api/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/nodeflow-api/actions/workflows/ci.yml)

---

## What it does

NodeFlow is a backend platform that lets developers automate workflows via:

- **Job Queue** — Create async jobs with concurrency, retries, and structured logging
- **Real-time Updates** — WebSocket push events per job (no polling needed)
- **Webhook Engine** — Register endpoint URLs, receive signed payloads on job events
- **File Pipeline** — Upload files → background processing → metadata extraction
- **API Keys** — Secure access with bearer tokens, key rotation support
- **Rate Limiting** — Per-user Redis sliding-window rate limits
- **Idempotency** — Safely replay POST requests without side-effects

---

## Architecture

```
┌──────────────┐    ┌────────────────────────────────────────────────┐
│   Client     │    │               NodeFlow API (Express)            │
│              │    │  /v1/jobs  /v1/webhooks  /v1/files  /v1/api-keys│
└──────┬───────┘    └──────────────────────┬─────────────────────────┘
       │                                   │
       │  REST + WebSocket                 │
       │                                   ▼
       │                         ┌─────────────────┐
       │                         │   BullMQ Queues  │
       │                         │  (Redis-backed)  │
       │                         └────────┬─────────┘
       │                                  │
       │                         ┌────────▼─────────┐
       │                         │     Workers       │
       │                         │  jobProcessing    │
       │                         │  webhookDispatch  │
       │                         │  fileProcessing   │
       │                         └────────┬─────────┘
       │                                  │
       ▼                         ┌────────▼─────────┐
  Socket.io ◄──── Redis ────────►│  Postgres (Prisma)│
  (real-time)   pub/sub          └──────────────────┘
```

**Stack:** Node.js · TypeScript · Express 5 · BullMQ · Socket.io · Prisma · PostgreSQL · Redis

---

## Features at a Glance

| Feature | Details |
|---|---|
| Job Queue | BullMQ with DB-backed state (QUEUED → RUNNING → SUCCEEDED/FAILED) |
| Structured Logs | Per-job log entries with level, message, metadata |
| Real-time | Socket.io with Redis adapter for cross-process pub/sub |
| Webhooks | HMAC-SHA256 signed payloads, exponential backoff retries, circuit breaker |
| File Upload | Multipart with Multer, pluggable storage (Local / S3 interface) |
| Auth | API Key authentication with SHA-256 hashed storage |
| Rate Limiting | Redis sliding window, configurable per route |
| Idempotency | `Idempotency-Key` header support for POST/PATCH |
| Observability | Bull Board dashboard at `/admin/queues`, Swagger at `/docs` |
| CI/CD | GitHub Actions with lint, build, test, Docker build, Trivy scan |

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+

### Local Development

```bash
# 1. Clone and install
git clone <repo-url>
cd nodeflow-api
npm install

# 2. Start infrastructure
docker compose up -d db redis

# 3. Run Prisma migrations
npx prisma migrate dev

# 4. Start API server
npm run dev

# 5. Start worker process (separate terminal)
npm run dev:worker
```

The API will be available at `http://localhost:4000`.

### Production (Docker Compose)

```bash
# Copy and configure environment
cp .env.example .env

# Start everything
docker compose -f docker-compose.prod.yml up -d

# Run DB migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

---

## API Endpoints

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe |

### Jobs
| Method | Path | Description |
|---|---|---|
| POST | `/v1/jobs` | Create a job |
| GET | `/v1/jobs` | List jobs (cursor paginated) |
| GET | `/v1/jobs/:id` | Get job details |
| GET | `/v1/jobs/:id/logs` | Get structured job logs |
| DELETE | `/v1/jobs/:id` | Cancel a job |

### Webhooks
| Method | Path | Description |
|---|---|---|
| POST | `/v1/webhooks` | Register a webhook endpoint |
| GET | `/v1/webhooks` | List webhooks |
| GET | `/v1/webhooks/:id` | Get webhook details |
| PATCH | `/v1/webhooks/:id` | Update webhook (url, events, active) |
| DELETE | `/v1/webhooks/:id` | Delete webhook |
| GET | `/v1/webhooks/:id/deliveries` | List delivery history |

### Files
| Method | Path | Description |
|---|---|---|
| POST | `/v1/files` | Upload a file (multipart/form-data) |
| GET | `/v1/files` | List files |
| GET | `/v1/files/:id` | Get file metadata |
| GET | `/v1/files/:id/download` | Download file |
| DELETE | `/v1/files/:id` | Soft-delete file |

### API Keys
| Method | Path | Description |
|---|---|---|
| POST | `/v1/api-keys` | Create key (returns raw key once) |
| GET | `/v1/api-keys` | List keys (masked) |
| DELETE | `/v1/api-keys/:id` | Revoke key |

### Admin
| Path | Description |
|---|---|
| `/admin/queues` | Bull Board queue dashboard |
| `/docs` | Swagger UI |

---

## Webhook Security

All webhook deliveries include:
```
X-Nodeflow-Signature: sha256=<hmac-hex>
X-Nodeflow-Event:     job.completed
X-Nodeflow-Delivery-Id: <uuid>
```

Verify on your server:
```typescript
import { createHmac } from "node:crypto";

const signature = createHmac("sha256", webhookSecret)
  .update(rawBody)
  .digest("hex");

if (`sha256=${signature}` !== req.headers["x-nodeflow-signature"]) {
  return res.status(401).end();
}
```

---

## Testing

```bash
npm run test              # All tests
npm run test:coverage     # With coverage report
npm run lint              # ESLint
npm run build             # TypeScript compile
```

**Test suites (31 tests across 7 suites):**
- `health.test.ts` — Liveness probe
- `jobs.test.ts` — Job CRUD & lifecycle routes
- `workers.test.ts` — Handler registry & job processing logic
- `socket.test.ts` — WebSocket real-time event lifecycle
- `webhooks.test.ts` — Webhook CRUD routes
- `files.test.ts` — File upload & download routes
- `cross-cutting.test.ts` — Auth, rate limiting, idempotency, API versioning

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Server port |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `LOG_LEVEL` | `info` | Winston log level |
| `STORAGE_PROVIDER` | `local` | `local` or `s3` |
| `API_BASE_URL` | `http://localhost:4000` | Public base URL (used in Swagger) |
