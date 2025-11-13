#!/bin/bash

echo "🔍 ABS-V2 Network Diagnostics"
echo "================================"
echo ""

# Get current IP
echo "📍 Current IP Address:"
ipconfig getifaddr en0 || echo "Could not detect IP (are you on WiFi?)"
echo ""

# Check Docker containers
echo "🐳 Docker Container Status:"
docker-compose ps
echo ""

# Check backend health
echo "🏥 Backend Health Check:"
curl -s http://10.1.10.112:3001/health | json_pp || echo "❌ Backend not responding"
echo ""

# Check if ports are listening
echo "🔌 Port Status:"
lsof -i :3001 | grep LISTEN && echo "✅ Backend port 3001 is open" || echo "❌ Backend port 3001 is not listening"
lsof -i :5173 | grep LISTEN && echo "✅ Frontend port 5173 is open" || echo "❌ Frontend port 5173 is not listening"
lsof -i :27017 | grep LISTEN && echo "✅ MongoDB port 27017 is open" || echo "❌ MongoDB port 27017 is not listening"
echo ""

# Check docker-compose config
echo "⚙️  Docker Compose Environment Variables:"
echo "Backend FRONTEND_URL:"
docker-compose exec -T backend printenv FRONTEND_URL 2>/dev/null || echo "❌ Cannot read backend env"
echo "Frontend VITE_API_URL:"
docker-compose exec -T frontend printenv VITE_API_URL 2>/dev/null || echo "❌ Cannot read frontend env"
echo ""

# Recent backend logs
echo "📝 Recent Backend Logs (last 20 lines):"
docker-compose logs --tail=20 backend
echo ""

# Recent frontend logs
echo "📝 Recent Frontend Logs (last 20 lines):"
docker-compose logs --tail=20 frontend
echo ""

echo "================================"
echo "✅ Diagnostics complete!"
echo ""
echo "Next steps:"
echo "1. Check if your IP matches docker-compose.yml (should be 10.1.10.112)"
echo "2. If IP changed, update docker-compose.yml and restart"
echo "3. Check logs above for errors"
echo "4. On remote computer, open browser console (F12) and check for errors"

