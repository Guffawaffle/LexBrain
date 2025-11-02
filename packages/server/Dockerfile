FROM node:22-bullseye-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY packages/server/package.json ./packages/server/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/server/ ./packages/server/
COPY tsconfig.base.json ./

# Build the application
RUN pnpm --filter lexbrain-server build

# Create non-root user
RUN groupadd -r lexbrain && useradd -r -g lexbrain lexbrain
RUN chown -R lexbrain:lexbrain /app
USER lexbrain

# Expose port
EXPOSE 6901

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:6901/health || exit 1

# Start the server
CMD ["node", "packages/server/dist/server.js"]
