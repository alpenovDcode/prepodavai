FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Настройка npm для более надежной установки
RUN npm config set fetch-retries 5 && \
  npm config set fetch-retry-mintimeout 20000 && \
  npm config set fetch-retry-maxtimeout 120000 && \
  npm config set fetch-timeout 300000

COPY worker/package.json worker/package-lock.json* ./
# Используем npm install с флагами для более надежной установки
RUN if [ -f package-lock.json ]; then \
  npm ci --include=dev --prefer-offline --no-audit || npm install --prefer-offline --no-audit; \
  else \
  npm install --prefer-offline --no-audit; \
  fi

FROM base AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY worker/ .
COPY --from=deps /app/node_modules ./node_modules
COPY backend/prisma ./prisma

# Generate Prisma Client
RUN npm run prisma:generate

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/package.json ./package.json

USER worker

CMD ["node", "dist/main.js"]

