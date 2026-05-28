# ---------- deps: install production-friendly node_modules ----------
FROM node:20-alpine AS deps
WORKDIR /app
# Only copy manifests first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- builder: build the Next.js app ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Produces a self-contained .next/standalone (see next.config.js: output: 'standalone')
RUN npm run build

# ---------- runner: minimal production image ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget is used by the container HEALTHCHECK below (alpine ships busybox wget).
# Run as a non-root user for safety.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy the standalone server + static assets + public dir.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Persisted cache dir (3-day result store). Mount a volume here to keep it
# across container restarts. Owned by the runtime user so it's writable.
RUN mkdir -p /app/.cache && chown -R nextjs:nodejs /app/.cache
VOLUME ["/app/.cache"]

USER nextjs
EXPOSE 3000

# Container-level health check hits the /api/health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"status":"ok"' || exit 1

CMD ["node", "server.js"]
