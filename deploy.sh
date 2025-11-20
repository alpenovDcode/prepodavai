#!/bin/bash

# PrepodavAI Production Deployment Script

# Exit on error
set -e

echo "🚀 Starting deployment process..."

# 1. Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull

# 2. Build and start services
echo "🏗️  Building and starting services..."
docker-compose -f docker-compose.prod.yml up -d --build

# 3. Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# 4. Run migrations
echo "🔄 Running database migrations..."
docker-compose -f docker-compose.prod.yml exec -T backend npm run prisma:migrate deploy

# 5. Optional: Seed database (uncomment if needed, but be careful in production!)
# echo "🌱 Seeding database..."
# docker-compose -f docker-compose.prod.yml exec -T backend npm run prisma:seed

echo "✅ Deployment completed successfully!"
echo "   Backend: http://localhost:3001 (or your domain)"
echo "   Frontend: http://localhost:3000 (or your domain)"
echo "   Logs: docker-compose -f docker-compose.prod.yml logs -f"
