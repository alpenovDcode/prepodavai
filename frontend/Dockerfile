FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
# Настройка npm для более надежной установки
RUN npm config set fetch-retries 5 && \
  npm config set fetch-retry-mintimeout 20000 && \
  npm config set fetch-retry-maxtimeout 120000 && \
  npm config set fetch-timeout 300000

COPY package.json package-lock.json* ./
# Используем npm install с флагами для более надежной установки
RUN if [ -f package-lock.json ]; then \
  npm ci --prefer-offline --no-audit || npm install --prefer-offline --no-audit; \
  else \
  npm install --prefer-offline --no-audit; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Прокидываем публичные переменные на этап сборки.
# ВАЖНО: все NEXT_PUBLIC_* должны быть доступны в `npm run build`, потому что
# Next.js инлайнит их в клиентский бандл во время сборки, а не runtime.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_PUBLIC_REDESIGN_V2
ENV NEXT_PUBLIC_REDESIGN_V2=${NEXT_PUBLIC_REDESIGN_V2}

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Копируем public директорию
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Копируем standalone сборку
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

