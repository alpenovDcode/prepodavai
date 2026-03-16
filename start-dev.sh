#!/bin/bash

echo "🚀 Starting PrepodavAI (Frontend + Backend)..."

# 0. Start Infrastructure (Postgres + Redis)
echo "🐘 Starting Database & Cache..."
docker compose up -d postgres redis
echo "⏳ Waiting for DB to be ready..."
sleep 5 # Give it a moment to initialize

# 1. Install root dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "📦 Installing root dependencies..."
    npm install
fi

# 2. Setup Backend
echo "🔧 Setting up Backend..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
fi

# Important: Generate Prisma Client so the backend can talk to the DB
echo "🗄️ Generating Prisma Client..."
npm run prisma:generate
cd ..

# 3. Setup Frontend
echo "🎨 Setting up Frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi
cd ..

# 4. Start both services
echo "✅ Starting services..."
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:3001"

# Use npx concurrently to run them together
npx concurrently -n "BACKEND,FRONTEND" -c "blue,magenta" \
    "npm run dev:backend" \
    "npm run dev:frontend"
