#!/bin/bash

echo "🔄 Fixing and restarting ABS-V2..."
echo ""

# Stop everything
echo "⏹️  Stopping containers..."
docker-compose down

# Remove any cached builds
echo "🧹 Cleaning build cache..."
docker-compose build --no-cache frontend backend

# Start everything
echo "🚀 Starting containers..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 15

# Check health
echo ""
echo "🏥 Checking health..."
curl -s http://10.1.10.112:3001/health && echo "" && echo "✅ Backend is healthy!" || echo "❌ Backend health check failed"

echo ""
echo "================================"
echo "✅ Restart complete!"
echo ""
echo "📱 Access the app at: http://10.1.10.112:5173"
echo ""
echo "To check logs:"
echo "  docker-compose logs -f backend"
echo "  docker-compose logs -f frontend"

