FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update && apt-get install -y \
    openssl \
    libssl-dev \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libatspi2.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 \
    libnss3 libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 wget \
    fonts-noto fonts-noto-cjk fonts-ipafont-gothic fonts-wqy-zenhei fonts-kacst fonts-freefont-ttf fonts-thai-tlwg fonts-indic \
    && rm -rf /var/lib/apt/lists/*
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
RUN apt-get update && apt-get install -y \
    openssl \
    libssl-dev \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libatspi2.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 \
    libnss3 libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN ./node_modules/.bin/prisma generate

RUN npm run build

# Compile admin creation script
RUN npx tsc scripts/create-admin.ts --outDir dist/scripts --esModuleInterop --skipLibCheck

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libatspi2.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 \
    libnss3 libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 wget \
    fonts-noto fonts-noto-cjk fonts-ipafont-gothic fonts-wqy-zenhei fonts-kacst fonts-freefont-ttf fonts-thai-tlwg fonts-indic \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/src/templates ./src/templates
COPY --from=builder --chown=nestjs:nodejs /app/scripts ./scripts

ENV PUPPETEER_CACHE_DIR=/home/nestjs/.cache/puppeteer
RUN mkdir -p $PUPPETEER_CACHE_DIR && chown -R nestjs:nodejs /home/nestjs
RUN PUPPETEER_CACHE_DIR=$PUPPETEER_CACHE_DIR npx puppeteer browsers install chrome

# Create uploads directory with correct permissions
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

USER nestjs

EXPOSE 3001

CMD ["node", "dist/main.js"]

