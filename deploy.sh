#!/bin/bash

# Stop on error
set -e

echo "🚀 Starting deployment..."

# Pull latest changes (FORCE UPDATE)
echo "📥 Fetching latest changes from git (FORCE UPDATE)..."
git fetch --all
git reset --hard origin/master

# Build and start containers
echo "🏗️ Building and starting containers..."
docker compose -f docker-compose.yml up -d --build

# Clean up unused images
echo "🧹 Cleaning up unused images..."
docker image prune -f

# Run migrations
echo "🔄 Running database migrations..."
docker compose -f docker-compose.yml exec backend npx prisma migrate deploy

echo "✅ Deployment completed successfully!"
