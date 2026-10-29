# Deploying nodeflow-api to the Oracle VM

Target: `https://nodeflow.141-148-69-94.sslip.io` on the Oracle Cloud Ampere ARM VM, behind the
Caddy container that already serves `whoami` and `authcore`.

```
GitHub Actions        GHCR                        Oracle VM (arm64)                        Internet
──────────────        ────                        ─────────────────                        ────────
push to main
  └ NodeFlow CI ─ok─► nodeflow-api          ──►  nodeflow-api:4000  (api)   ──┐
      │               nodeflow-api-worker   ──►  nodeflow-worker        │      ├─► Caddy :443 ─► TLS
      └ Deploy ─────── ssh ────────────────►    nodeflow-postgres  (internal) ─┘
                                                nodeflow-redis     (internal)
                                                uploads volume (shared by api + worker)
```

Two images, one stack. Nothing is built on the server: CI builds both `linux/arm64` images, pushes
them to GHCR, and the host only runs `docker compose pull && docker compose up -d`.

---

## 1. GitHub repository secrets

This is a **separate repository** (`cypher682/nodeflow-api`), so the secrets added for
`authcore-service` do not carry over. Add the same three here:

| Secret | Required | Value |
|---|---|---|
| `DEPLOY_HOST` | yes | `141.148.69.94` |
| `DEPLOY_USER` | yes | `deploy` |
| `DEPLOY_SSH_KEY` | yes | Private key of the deploy keypair, full PEM including header/footer lines |
| `DEPLOY_PORT` | no | `22` if omitted |
| `GHCR_USER` | only if the packages are private | `cypher682` |
| `GHCR_TOKEN` | only if the packages are private | Classic PAT with `read:packages` |

Reusing the existing key is fine — it is already in `deploy`'s `authorized_keys`:

```bash
gh secret set DEPLOY_HOST --body 141.148.69.94 --repo cypher682/nodeflow-api
gh secret set DEPLOY_USER --body deploy --repo cypher682/nodeflow-api
gh secret set DEPLOY_SSH_KEY --repo cypher682/nodeflow-api < ~/.ssh/ci_deploy
```

Application settings (DB password, CORS origin) stay in `/opt/apps/nodeflow/.env` on the server.

**Public or private package?** Public is the simpler default: `docker compose pull` then needs no
credentials on the host. Push once, open both packages under the repo's *Packages*, and set
visibility to public if they were created private.

---

## 2. One-time server preparation

The `deploy` user, docker group, and the `web` network already exist from the authcore setup.
Only the directory is new:

```bash
sudo mkdir -p /opt/apps/nodeflow
sudo chown deploy:deploy /opt/apps/nodeflow
```

---

## 3. The application `.env`

```bash
cd /opt/apps/nodeflow
install -m 600 /dev/null .env
cat > .env <<EOF
POSTGRES_USER=nodeflow
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=nodeflow
NODE_ENV=production
API_BASE_URL=https://nodeflow.141-148-69-94.sslip.io
CORS_ORIGIN=https://cypher682.github.io
LOG_LEVEL=info
STORAGE_PROVIDER=local
EOF
chmod 600 .env
```

Hex only for the password: it is interpolated into `DATABASE_URL`, so `@ : /` would corrupt the
connection string. The compose file supplies `DATABASE_URL` and `REDIS_URL` itself, pointing at the
container names — do not put `localhost` URLs here.

---

## 4. The Caddy block

Add `deploy/Caddyfile.snippet` to `/opt/caddy/Caddyfile`, validate, then reload:

```bash
sudo cp /opt/caddy/Caddyfile /opt/caddy/Caddyfile.bak
sudo tee -a /opt/caddy/Caddyfile >/dev/null <<'EOF'

nodeflow.141-148-69-94.sslip.io {
	encode zstd gzip

	handle /admin/queues* {
		respond "Not found" 404
	}

	handle {
		reverse_proxy nodeflow-api:4000
	}
}
EOF

sudo docker exec caddy caddy validate --config /etc/caddy/Caddyfile
sudo docker exec caddy caddy reload  --config /etc/caddy/Caddyfile
```

The `/admin/queues` block is deliberate. Bull Board has no authentication of its own and exposes
retry, drain and delete on every queue; publishing it on a public hostname would let anyone cancel
your jobs. Locally it stays available at `http://localhost:4000/admin/queues`.

No DNS record is needed: `nodeflow.<ip-with-dashes>.sslip.io` resolves to `141.148.69.94` by
construction. Until the API container exists, requests return `502` — expected before the first
deploy.

---

## 5. First deploy

```bash
git push origin main        # or: Actions -> Deploy -> Run workflow
```

Watch the `Deploy` run: *Build and push images* (two arm64 builds under QEMU) → *Deploy to Oracle
VM* → *Verify the public endpoint*.

Verify by hand:

```bash
curl -s https://nodeflow.141-148-69-94.sslip.io/health
curl -sLI https://nodeflow.141-148-69-94.sslip.io/docs | head -n1      # -L: /docs 301s to /docs/
curl -s -o /dev/null -w '%{http_code}\n' https://nodeflow.141-148-69-94.sslip.io/admin/queues   # 404
ssh deploy@141.148.69.94 'cd /opt/apps/nodeflow && docker compose ps'
```

---

## 6. What happens on a normal push

1. `NodeFlow CI` runs lint, TypeScript build, Jest against live Postgres + Redis, both image builds,
   Trivy scans.
2. If CI succeeded on `main`, `Deploy` builds both images for `linux/arm64` and pushes `:<sha>` and
   `:latest`.
3. The runner `scp`s `deploy/docker-compose.prod.yml` to `/opt/apps/nodeflow/docker-compose.yml` —
   the repo is the source of truth for the stack definition.
4. It runs `docker compose pull` and `up -d --wait --wait-timeout 240`. The API container runs
   `npx prisma migrate deploy` before `node dist/main.js`, so schema changes land before traffic.
5. It runs `docker compose exec api npx prisma migrate status` on the host. This is the real gate:
   `/health` returns a constant and stays green with a dead database, while `migrate status` fails
   if Postgres is unreachable or the schema is behind.
6. It polls the public `/health` and `/docs` (following the `/docs` → `/docs/` redirect) and fails
   the run if either is not serving.

**Rollback** — every push keeps an immutable sha tag:

```bash
ssh deploy@141.148.69.94
cd /opt/apps/nodeflow
IMAGE_TAG=<previous-sha> docker compose up -d
```

---

## 7. When it breaks

| Symptom | Cause |
|---|---|
| `permission denied (publickey)` | `DEPLOY_USER`/key mismatch, or `~/.ssh` on the server is group-writable |
| `docker: permission denied` on socket | `deploy` not in the `docker` group in that session |
| `compose up` exits non-zero | Health wait timed out; the run prints `compose ps` and both logs |
| API crash-loops on `migrate deploy` | Wrong `POSTGRES_*` in `.env`, or Postgres not yet healthy |
| `Error: pull access denied` | Package is private and `GHCR_*` secrets are missing |
| `502` from Caddy, container healthy | API not on the `web` network, or upstream name differs from `container_name` |
| `exec format error` | Image built for the wrong platform — the VM is arm64 |
| Uploads fail with `EACCES` | The `uploads` volume is root-owned; the image creates `/app/uploads` as `nodeflow` |

Logs live on the host, not in Actions:

```bash
cd /opt/apps/nodeflow && docker compose logs --tail 100 api
cd /opt/apps/nodeflow && docker compose logs --tail 100 worker
sudo docker logs caddy --tail 50
```

---

## 8. Before you publish this URL

`/v1/api-keys` requires a bearer key, but **`/v1/jobs`, `/v1/webhooks` and `/v1/files` do not** —
`requireApiKey` is only mounted on the api-keys router, and `POST /v1/bootstrap` mints a key for
anyone who asks. Nothing in this pipeline changes that, but on a public hostname it means anyone
can enqueue jobs, register webhooks and upload files until the rate limiter (100/min per IP) says
stop. Adding `requireApiKey` to the three routers is the fix; it is a code change with a test
impact, so it is deliberately not bundled into the deployment wiring.

---

## 9. Two things that will bite later

**The hostname is tied to the IP.** `141-148-69-94` is part of the URL. If the instance's public IP
changes, every URL breaks. A wildcard `*.yourdomain.dev` A record reduces that to one edit each in
the Caddyfile and `PUBLIC_URL` in `deploy.yml`.

**The Trivy gate is advisory here, not blocking.** `ci.yml` sets `exit-code: '0'` on both scans, so
a CRITICAL in the base image or a transitive dependency ships. The authcore pipeline catches this
because its gate exits 1; flipping `exit-code` to `'1'` is the one-line equivalent, and doing so
will likely surface something in `node:20-alpine` or the npm tree that has to be bumped first.
