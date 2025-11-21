#!/bin/bash

# Stop on error
set -e

echo "🚀 Starting deployment..."

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull

# Build and start containers
echo "🏗️ Building and starting containers..."
docker compose -f docker-compose.yml up -d --build

# Run migrations
echo "🔄 Running database migrations..."
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

echo "✅ Deployment completed successfully!"
