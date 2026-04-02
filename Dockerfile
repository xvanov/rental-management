# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Dummy DATABASE_URL for prisma generate during build (no actual connection made)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN mkdir -p public
RUN npm run build

# Stage 3: Production runner (Debian-slim for glibc — needed by Playwright)
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install system dependencies for Chromium (Puppeteer PDF gen) and Python (scrapers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    python3 \
    python3-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Set up Python virtual environment for utility scrapers
RUN python3 -m venv /app/scraper-venv
RUN /app/scraper-venv/bin/pip install --no-cache-dir \
    playwright>=1.40.0 \
    pdfplumber>=0.10.0 \
    python-dotenv>=1.0.0 \
    requests>=2.31.0 \
    imapclient>=2.3.0

# Install Playwright Chromium browser
ENV PLAYWRIGHT_BROWSERS_PATH=/app/scraper-browsers
RUN /app/scraper-venv/bin/playwright install --with-deps chromium

# Use the existing 'node' user (uid 1000) from the base image
# This matches the host volume owner for correct permissions

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Copy Prisma client (needed at runtime)
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy utility scraper scripts
COPY --from=builder --chown=node:node /app/scripts ./scripts

# Create data directories for signed documents, bills, and media
RUN mkdir -p /app/data/downloaded-bills /app/data/signed-leases /app/data/message-media /app/data/bills \
    && chown -R node:node /app/data
RUN chown -R node:node /app/scraper-venv /app/scraper-browsers

USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
