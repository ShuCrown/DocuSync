# ============================================================
# DocuSync API — Node.js Docker image
# ============================================================
# Replaces the Cloudflare Worker with a standard Node.js server.
# Uses tsx to run TypeScript directly (no build step for backend).
# ============================================================

FROM node:20-alpine

# better-sqlite3 needs build tools for native addon
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install all dependencies (including tsx, @hono/node-server)
COPY worker/package.json worker/package-lock.json* ./
RUN npm install

# Copy worker source (shims + entry + original index.ts)
COPY worker/src ./src

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/data/db/docusync.sqlite
ENV FILES_DIR=/data/files

VOLUME ["/data"]

CMD ["npx", "tsx", "src/entry.node.ts"]
