#!/bin/bash

echo "🧪 ABS-V2 Quick Network Test"
echo "============================"
echo ""

# Get IP
MY_IP=$(ipconfig getifaddr en0 2>/dev/null)

if [ -z "$MY_IP" ]; then
    echo "❌ Could not detect IP address"
    echo "Are you connected to WiFi?"
    echo ""
    echo "Try manually with: ipconfig getifaddr en0"
    exit 1
fi

echo "📍 Your IP Address: $MY_IP"
echo ""

# Check if docker-compose has matching IP
echo "⚙️  Checking docker-compose.yml configuration..."
COMPOSE_IP=$(grep "VITE_API_URL" docker-compose.yml | head -1 | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}')

if [ "$MY_IP" = "$COMPOSE_IP" ]; then
    echo "✅ docker-compose.yml has correct IP: $COMPOSE_IP"
else
    echo "⚠️  WARNING: IP mismatch!"
    echo "   Current IP: $MY_IP"
    echo "   docker-compose.yml: $COMPOSE_IP"
    echo ""
    echo "   You need to update docker-compose.yml and restart!"
fi
echo ""

# Check containers
echo "🐳 Docker Container Status:"
docker-compose ps 2>/dev/null || echo "❌ Docker Compose not running"
echo ""

# Test backend health
echo "🏥 Testing Backend Health..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://$MY_IP:3001/health)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Backend is healthy!"
    echo "$HEALTH_RESPONSE" | head -n -1 | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE" | head -n -1
else
    echo "❌ Backend health check failed (HTTP $HTTP_CODE)"
    echo "   Try: docker-compose logs backend"
fi
echo ""

# Test frontend
echo "🌐 Testing Frontend..."
FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$MY_IP:5173)

if [ "$FRONTEND_CODE" = "200" ]; then
    echo "✅ Frontend is responding!"
else
    echo "❌ Frontend not responding (HTTP $FRONTEND_CODE)"
    echo "   Try: docker-compose logs frontend"
fi
echo ""

# Test port accessibility
echo "🔌 Testing Ports..."
lsof -i :3001 | grep LISTEN > /dev/null && echo "✅ Port 3001 (Backend) is open" || echo "❌ Port 3001 not listening"
lsof -i :5173 | grep LISTEN > /dev/null && echo "✅ Port 5173 (Frontend) is open" || echo "❌ Port 5173 not listening"
lsof -i :27017 | grep LISTEN > /dev/null && echo "✅ Port 27017 (MongoDB) is open" || echo "❌ Port 27017 not listening"
echo ""

echo "============================"
echo "📋 Test Results Summary"
echo "============================"
echo ""
echo "✅ = Working  |  ❌ = Needs fixing  |  ⚠️  = Warning"
echo ""

# Summary
if [ "$HTTP_CODE" = "200" ] && [ "$FRONTEND_CODE" = "200" ] && [ "$MY_IP" = "$COMPOSE_IP" ]; then
    echo "🎉 ALL SYSTEMS GO!"
    echo ""
    echo "📱 Next Steps:"
    echo "1. Open on YOUR computer: http://$MY_IP:5173"
    echo "2. Test on your phone: http://$MY_IP:5173"
    echo "3. Make sure phone is on same WiFi!"
    echo ""
    echo "🧪 Test these features:"
    echo "   - Upload order file"
    echo "   - View velocity"
    echo "   - Generate forecast"
    echo "   - Run simulation"
    echo ""
    echo "✅ If phone test passes, it's ready to share!"
else
    echo "⚠️  ISSUES DETECTED"
    echo ""
    echo "🔧 Recommended fixes:"
    
    if [ "$MY_IP" != "$COMPOSE_IP" ]; then
        echo "1. Update docker-compose.yml with IP: $MY_IP"
        echo "2. Run: docker-compose down && docker-compose up"
    fi
    
    if [ "$HTTP_CODE" != "200" ]; then
        echo "3. Check backend logs: docker-compose logs backend"
    fi
    
    if [ "$FRONTEND_CODE" != "200" ]; then
        echo "4. Check frontend logs: docker-compose logs frontend"
    fi
    
    echo ""
    echo "Or run the fix script: ./fix-and-restart.sh"
fi

echo ""

