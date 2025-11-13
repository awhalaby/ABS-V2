# Network Access Troubleshooting Guide

## Issue: Can access the app but file uploads don't work

### Problem

You can open the application on another computer, but when you try to upload order files, it fails.

### Root Cause

The Vite dev server had a proxy configuration that redirected `/api` requests to `localhost:3001`. When accessing from another computer, `localhost` refers to that remote computer, not your host machine.

### Solution ✅

**Already fixed!** The proxy has been removed from `vite.config.js`. The frontend now uses the `VITE_API_URL` environment variable directly, which points to your machine's IP address.

### Steps to Apply the Fix

1. **Rebuild and restart the containers:**

   ```bash
   docker-compose down
   docker-compose build --no-cache frontend
   docker-compose up
   ```

2. **Clear browser cache on remote computers:**

   - Chrome/Edge: Press `Ctrl+Shift+Delete` or `Cmd+Shift+Delete`
   - Or use Incognito/Private mode

3. **Verify the fix:**
   - Open browser console (F12)
   - Go to Network tab
   - Try uploading a file
   - Check that requests go to `http://10.1.10.112:3001/api/orders/load` (not localhost)

---

## Other Common Issues

### 1. Can't connect at all from other devices

**Symptoms:** The page won't load at all

**Causes:**

- Firewall blocking ports 3001 or 5173
- Wrong IP address
- Not on same network

**Solutions:**

```bash
# Mac - Allow ports in firewall
# System Settings > Network > Firewall > Options
# Allow incoming connections for Docker/Node

# Linux - Open ports
sudo ufw allow 3001/tcp
sudo ufw allow 5173/tcp

# Test if ports are accessible
curl http://10.1.10.112:3001/health
```

### 2. Page loads but shows "Network Error" or "Failed to fetch"

**Symptoms:**

- Page loads but can't fetch data
- Console shows CORS errors
- API calls fail

**Possible Causes:**

- Backend not accessible
- CORS misconfiguration
- Backend crashed

**Solutions:**

1. **Check backend is running:**

   ```bash
   docker-compose logs backend
   ```

2. **Verify backend health:**

   ```bash
   curl http://10.1.10.112:3001/health
   ```

3. **Check CORS in backend logs:**
   Look for CORS-related errors in `docker-compose logs backend`

4. **Restart backend:**
   ```bash
   docker-compose restart backend
   ```

### 3. WebSocket connection fails (for Simulation)

**Symptoms:**

- Simulation doesn't update in real-time
- Console shows "WebSocket connection failed"

**Solution:**

1. **Verify WebSocket URL in docker-compose.yml:**

   ```yaml
   frontend:
     environment:
       - VITE_WEBSOCKET_URL=http://10.1.10.112:3001
   ```

2. **Check Socket.IO connection:**
   Open browser console and look for Socket.IO connection logs

3. **Restart both containers:**
   ```bash
   docker-compose restart backend frontend
   ```

### 4. Slow performance from remote devices

**Symptoms:**

- Page loads slowly
- File uploads are very slow
- Laggy interface

**Causes:**

- Large file sizes
- Weak WiFi signal
- Network congestion

**Solutions:**

- Use smaller test files first
- Move closer to WiFi router
- Use wired connection if possible
- Check network speed: https://fast.com

### 5. "Failed to upload" after timeout

**Symptoms:**

- Large files fail to upload
- Timeout errors after 30 seconds

**Solution:**

Update frontend API timeout in `frontend/src/utils/api.js`:

```javascript
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increase to 60 seconds (default was 30000)
  headers: {
    "Content-Type": "application/json",
  },
});
```

---

## Verification Checklist

Use this checklist to verify everything is working:

### From Host Machine (your computer):

- [ ] Can access: `http://10.1.10.112:5173` ✅
- [ ] Can access: `http://10.1.10.112:3001/health` ✅
- [ ] Can upload order files ✅
- [ ] Can view velocity data ✅
- [ ] Can generate forecasts ✅
- [ ] Simulation updates in real-time ✅

### From Remote Machine (other computer):

- [ ] Can access: `http://10.1.10.112:5173` ✅
- [ ] Backend health check works: `curl http://10.1.10.112:3001/health` ✅
- [ ] Can upload order files ✅
- [ ] Can view existing data ✅
- [ ] Can generate forecasts ✅
- [ ] Simulation updates in real-time ✅

---

## Debug Commands

### Check Docker containers are running:

```bash
docker-compose ps
```

All services should show "Up" status.

### View logs:

```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend

# MongoDB only
docker-compose logs -f mongodb
```

### Test API endpoint from remote computer:

```bash
# Health check
curl http://10.1.10.112:3001/health

# Get date ranges
curl http://10.1.10.112:3001/api/orders/date-ranges

# Test if backend is reachable
ping 10.1.10.112
```

### Check if ports are open:

```bash
# From remote computer
telnet 10.1.10.112 3001
telnet 10.1.10.112 5173

# Or use nc (netcat)
nc -zv 10.1.10.112 3001
nc -zv 10.1.10.112 5173
```

### Restart everything:

```bash
# Nuclear option - rebuild everything
docker-compose down
docker-compose build --no-cache
docker-compose up
```

---

## Still Having Issues?

1. **Check your IP hasn't changed:**

   ```bash
   ipconfig getifaddr en0
   ```

   If it changed, update docker-compose.yml and restart.

2. **Verify you're on the same network:**
   Both devices must be on the same WiFi/LAN.

3. **Try from your phone:**
   Connect phone to same WiFi and try accessing the URL.

4. **Check Docker resources:**

   ```bash
   docker stats
   ```

   Make sure containers have enough memory.

5. **Look at browser console:**
   Press F12 and check Console and Network tabs for errors.

---

## Quick Fix Script

Save this as `restart-and-test.sh`:

```bash
#!/bin/bash

echo "🔄 Restarting services..."
docker-compose down
docker-compose build --no-cache frontend
docker-compose up -d

echo "⏳ Waiting for services to start..."
sleep 10

echo "🧪 Testing backend health..."
curl http://10.1.10.112:3001/health

echo ""
echo "✅ Services restarted!"
echo "📱 Access from other devices: http://10.1.10.112:5173"
```

Run with:

```bash
chmod +x restart-and-test.sh
./restart-and-test.sh
```
