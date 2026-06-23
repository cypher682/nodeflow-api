# NodeFlow Local Demo UI

This is an interactive browser dashboard for manual testing and capturing portfolio evidence for NodeFlow. It communicates with the local Express API using `fetch()` and WebSockets (`socket.io-client`).

## Features
- **Key Bootstrapping:** Instantly seed and fetch a valid API key from the database.
- **WebSocket updates:** Streams BullMQ task status transitions directly to the browser.
- **Webhook Dispatching:** Add webhook subscriptions and monitor payload deliveries.
- **File Upload:** Upload mock files and see background metadata extraction happen in real-time.
- **Advanced Tools:** Test sliding-window rate limit headers, check idempotency request caches, and perform API version header negotiation.

## Quick Start

1. Start your local services (PostgreSQL, Redis):
   ```bash
   docker compose up -d db redis
   ```

2. Run the API and worker processes:
   ```bash
   # Terminal 1
   npm run dev
   
   # Terminal 2
   npm run dev:worker
   ```

3. Open this file directly in any modern web browser:
   ```text
   docs/demo/index.html
   ```

4. Click **Bootstrap Test Key** at the top left to instantly create a test user API key, then navigate through the tabs to test the workflows.
