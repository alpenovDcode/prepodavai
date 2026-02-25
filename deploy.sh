#!/bin/bash

# Zero Downtime Deployment Script
# Usage: ./deploy.sh

set -e

echo "🚀 Starting Zero Downtime Deployment..."

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.yml"
NGINX_CONTAINER="prepodavai-nginx-prod"
UPSTREAM_CONF="./nginx/conf.d/upstream.conf"

# 1. Detect current active container
if [ ! -f "$UPSTREAM_CONF" ] || ! grep -q "blue" "$UPSTREAM_CONF"; then
    # Default to assuming green is "current" (so we deploy blue)
    CURRENT_COLOR="green"
    NEW_COLOR="blue"
else
    CURRENT_COLOR="blue"
    NEW_COLOR="green"
fi

echo "🔵 Current environment: $CURRENT_COLOR"
echo "🟢 Deploying to: $NEW_COLOR"

# Pull latest changes (FORCE UPDATE)
echo "📥 Fetching latest changes from git (FORCE UPDATE)..."
git fetch --all
git reset --hard origin/master

# Build and start new containers
echo "🏗️ Building and starting $NEW_COLOR containers..."
docker compose -f $DOCKER_COMPOSE_FILE up -d --build --remove-orphans backend-$NEW_COLOR frontend-$NEW_COLOR worker telegram-bot nginx

# Run migrations
echo "🔄 Running database migrations..."
if ! docker exec -u root prepodavai-backend-$NEW_COLOR-prod npx prisma migrate deploy; then
    echo "❌ Migration failed!"
    docker compose -f $DOCKER_COMPOSE_FILE stop backend-$NEW_COLOR frontend-$NEW_COLOR
    exit 1
fi

# Fix permissions for uploads directory (since volume might be owned by root)
echo "🔧 Fixing permissions for uploads directory..."
docker exec -u root prepodavai-backend-$NEW_COLOR-prod chown -R nestjs:nodejs /app/uploads || true

# Wait for healthchecks
echo "⏳ Waiting for backend-$NEW_COLOR and frontend-$NEW_COLOR to be healthy..."
attempt=0
max_attempts=60

while [ $attempt -le $max_attempts ]; do
    attempt=$(( attempt + 1 ))
    backend_status=$(docker inspect --format='{{json .State.Health.Status}}' prepodavai-backend-$NEW_COLOR-prod 2>/dev/null || echo "\"missing\"")
    frontend_status=$(docker inspect --format='{{json .State.Health.Status}}' prepodavai-frontend-$NEW_COLOR-prod 2>/dev/null || echo "\"missing\"")
    
    if [ "$backend_status" == "\"healthy\"" ] && [ "$frontend_status" == "\"healthy\"" ]; then
        echo "✅ Both containers are healthy!"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ Timeout waiting for containers to become healthy."
        echo "⚠️  Rolling back..."
        docker compose -f $DOCKER_COMPOSE_FILE stop backend-$NEW_COLOR frontend-$NEW_COLOR
        exit 1
    fi
    
    echo "   ...waiting ($attempt/$max_attempts - backend: $backend_status, frontend: $frontend_status)"
    sleep 2
done

# Switch Nginx upstreams
echo "🔀 Switching Nginx traffic to $NEW_COLOR..."
cat <<EOF > "$UPSTREAM_CONF"
upstream frontend_backend {
    server prepodavai-frontend-$NEW_COLOR-prod:3000;
}

upstream api_backend {
    server prepodavai-backend-$NEW_COLOR-prod:3001;
}
EOF

# Reload Nginx
echo "🔄 Reloading Nginx..."
if [ "$(docker ps -q -f name=$NGINX_CONTAINER)" ]; then
    docker exec $NGINX_CONTAINER nginx -s reload
else
    echo "⚠️ Nginx container not found or not running. Restarting nginx..."
    docker compose -f $DOCKER_COMPOSE_FILE up -d nginx
fi

# Stop old containers
echo "🛑 Stopping old $CURRENT_COLOR containers..."
if [ "$(docker ps -q -f name=prepodavai-backend-$CURRENT_COLOR-prod)" ]; then
    docker compose -f $DOCKER_COMPOSE_FILE stop backend-$CURRENT_COLOR frontend-$CURRENT_COLOR
else
    echo "ℹ️  Old containers were not running."
fi

# Clean up unused images
echo "🧹 Cleaning up unused images..."
docker image prune -f

echo "✅ Deployment Complete! Active: $NEW_COLOR"
