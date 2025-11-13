# Quick Start: Share on Local Network

Follow these steps to allow others on your WiFi/LAN to access the application.

## Step 1: Find Your IP Address

```bash
# On Mac
ipconfig getifaddr en0

# On Linux
hostname -I | awk '{print $1}'

# On Windows (in PowerShell)
ipconfig | Select-String "IPv4"
```

Example result: `192.168.1.100` (yours will be different)

## Step 2: Update docker-compose.yml

Replace `YOUR_IP` with your actual IP in these lines:

```yaml
backend:
  environment:
    - FRONTEND_URL=http://YOUR_IP:5173 # e.g., http://192.168.1.100:5173

frontend:
  environment:
    - VITE_API_URL=http://YOUR_IP:3001 # e.g., http://192.168.1.100:3001
    - VITE_WEBSOCKET_URL=http://YOUR_IP:3001
```

## Step 3: Restart the Application

```bash
docker-compose down
docker-compose up --build
```

## Step 4: Share the URL

Give others this URL: `http://YOUR_IP:5173`

Example: `http://192.168.1.100:5173`

---

## Troubleshooting

### Can't connect from another device?

1. **Check firewall:**

   - Mac: System Settings > Network > Firewall > Allow Node/Docker
   - Windows: Allow ports 3001 and 5173 in Windows Firewall
   - Linux: `sudo ufw allow 3001/tcp && sudo ufw allow 5173/tcp`

2. **Verify the server is running:**

   ```bash
   curl http://YOUR_IP:3001/health
   ```

   Should return: `{"status":"ok",...}`

3. **Make sure you're on the same network:**
   Both devices must be connected to the same WiFi/LAN

4. **Test connection:**
   ```bash
   ping YOUR_IP
   ```

---

## Notes

- ✅ The backend is already configured to accept connections from any network interface
- ✅ CORS is set to allow all origins in development mode
- ⚠️ Your IP may change if you reconnect to WiFi - you'll need to update the config again
- ⚠️ This only works on the same local network (won't work over the internet)

For internet access, see [DEPLOYMENT.md](./DEPLOYMENT.md)
