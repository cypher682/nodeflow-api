FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS deps
RUN npm install

FROM deps AS build
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodeflow && adduser -S nodeflow -G nodeflow
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# The container runs `prisma migrate deploy` before starting, so the schema and migration
# history have to exist in the runtime image — the build stage is the only place they do.
COPY --from=build /app/prisma ./prisma
# LocalStorageProvider writes to <cwd>/uploads. Creating it as nodeflow means the named volume
# inherits the owner on first mount; without it the upload dir is root-owned and every upload fails.
RUN mkdir -p /app/uploads && chown -R nodeflow:nodeflow /app/uploads
USER nodeflow
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/main.js"]
