# Deployment Guide

This guide explains how to make the ABS-V2 application accessible to others.

## Table of Contents

1. [Local Network Access (Same WiFi)](#local-network-access)
2. [Cloud Deployment](#cloud-deployment)
3. [Temporary Access (ngrok)](#temporary-access-with-ngrok)
4. [Port Forwarding](#port-forwarding-from-home)

---

## Local Network Access

**Use case:** Share with colleagues on the same WiFi/LAN

### Steps:

1. **Find your local IP address:**

   ```bash
   # On Mac
   ipconfig getifaddr en0

   # On Linux
   hostname -I | awk '{print $1}'

   # On Windows
   ipconfig
   # Look for "IPv4 Address" under your active network adapter
   ```

   Example output: `192.168.1.100`

2. **Update docker-compose.yml:**
   The docker-compose.yml has been updated to listen on all network interfaces (0.0.0.0).

3. **Create environment files:**

   Backend - Create `backend/.env.local`:

   ```bash
   HOST=0.0.0.0
   PORT=3001
   MONGODB_URI=mongodb://mongodb:27017/bakehouse
   FRONTEND_URL=http://192.168.1.100:5173  # Replace with your IP
   ```

   Frontend - Create `frontend/.env.local`:

   ```bash
   VITE_API_URL=http://192.168.1.100:3001  # Replace with your IP
   VITE_WEBSOCKET_URL=http://192.168.1.100:3001  # Replace with your IP
   ```

4. **Update docker-compose.yml environment variables:**
   Replace the environment section with your actual IP:

   ```yaml
   backend:
     environment:
       - FRONTEND_URL=http://YOUR_LOCAL_IP:5173

   frontend:
     environment:
       - VITE_API_URL=http://YOUR_LOCAL_IP:3001
       - VITE_WEBSOCKET_URL=http://YOUR_LOCAL_IP:3001
   ```

5. **Restart the application:**

   ```bash
   docker-compose down
   docker-compose up --build
   ```

6. **Share the URL:**
   Others on the same network can access: `http://YOUR_LOCAL_IP:5173`

   Example: `http://192.168.1.100:5173`

### Firewall Configuration:

You may need to allow incoming connections on ports 3001 and 5173:

**Mac:**

```bash
# System Settings > Network > Firewall
# Allow incoming connections for Node/Docker
```

**Linux:**

```bash
sudo ufw allow 3001/tcp
sudo ufw allow 5173/tcp
sudo ufw allow 27017/tcp  # If MongoDB needs external access
```

**Windows:**

```powershell
# Windows Defender Firewall > Advanced Settings > Inbound Rules
# Create new rules for ports 3001, 5173
```

---

## Cloud Deployment

**Use case:** Access from anywhere on the internet

### Option A: DigitalOcean/AWS/GCP (Recommended for Production)

1. **Provision a server (Droplet/EC2/Compute Engine)**

   - Recommended: 2GB RAM, 1 CPU minimum
   - OS: Ubuntu 22.04 LTS

2. **Install dependencies:**

   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER

   # Install Docker Compose
   sudo apt install docker-compose -y
   ```

3. **Clone your repository:**

   ```bash
   git clone https://github.com/yourusername/ABS-V2.git
   cd ABS-V2
   ```

4. **Update configuration with your domain/IP:**

   Edit `docker-compose.yml`:

   ```yaml
   backend:
     environment:
       - NODE_ENV=production
       - FRONTEND_URL=http://your-server-ip:5173
       # Or with domain: https://your-domain.com

   frontend:
     environment:
       - VITE_API_URL=http://your-server-ip:3001
       # Or with domain: https://api.your-domain.com
   ```

5. **Configure firewall:**

   ```bash
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw allow 3001/tcp # Backend API
   sudo ufw allow 5173/tcp # Frontend
   sudo ufw enable
   ```

6. **Start the application:**

   ```bash
   docker-compose up -d
   ```

7. **Set up SSL (optional but recommended):**

   ```bash
   # Install certbot
   sudo apt install certbot

   # Get SSL certificate
   sudo certbot certonly --standalone -d your-domain.com
   ```

### Option B: Heroku/Railway/Render (Easy, Free Tier Available)

These platforms offer simple deployment with Git push:

**Railway.app (Recommended):**

1. Sign up at https://railway.app
2. Create new project from GitHub
3. Add MongoDB plugin
4. Set environment variables in dashboard
5. Deploy automatically on push

**Render.com:**

1. Sign up at https://render.com
2. Create Web Service from Git
3. Add MongoDB (via Render or MongoDB Atlas)
4. Configure environment variables
5. Deploy

---

## Temporary Access with ngrok

**Use case:** Quick demo/testing without deployment

1. **Install ngrok:**

   ```bash
   # Mac
   brew install ngrok

   # Or download from https://ngrok.com/download
   ```

2. **Sign up and authenticate:**

   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

3. **Start your application locally:**

   ```bash
   docker-compose up
   ```

4. **Create tunnels for both frontend and backend:**

   Terminal 1 (Backend):

   ```bash
   ngrok http 3001
   ```

   Terminal 2 (Frontend):

   ```bash
   ngrok http 5173
   ```

5. **Update frontend config:**
   Create `frontend/.env.local`:

   ```bash
   VITE_API_URL=https://your-backend-url.ngrok.io
   VITE_WEBSOCKET_URL=https://your-backend-url.ngrok.io
   ```

6. **Restart frontend:**

   ```bash
   docker-compose restart frontend
   ```

7. **Share the frontend URL:**
   The ngrok URL (e.g., `https://abc123.ngrok.io`) can be shared with anyone.

**Note:** Free ngrok URLs expire after 2 hours and change on restart.

---

## Port Forwarding from Home

**Use case:** Expose your home computer to the internet

⚠️ **Security Warning:** This exposes your home network. Use with caution.

1. **Find your router's admin page:**
   Usually `192.168.1.1` or `192.168.0.1`

2. **Enable port forwarding:**

   - Forward external port 80 → your local IP:5173 (Frontend)
   - Forward external port 3001 → your local IP:3001 (Backend)

3. **Find your public IP:**

   ```bash
   curl ifconfig.me
   ```

4. **Update configuration:**
   Use your public IP in the environment variables.

5. **Consider dynamic DNS:**
   If your IP changes, use a service like:
   - DuckDNS (free)
   - No-IP (free)
   - Cloudflare (free)

---

## Production Checklist

When deploying for real use:

- [ ] Use HTTPS/SSL certificates
- [ ] Set `NODE_ENV=production`
- [ ] Use strong MongoDB credentials
- [ ] Enable authentication
- [ ] Set up proper CORS origins (not `origin: true`)
- [ ] Configure proper logging
- [ ] Set up monitoring (Datadog, New Relic, etc.)
- [ ] Regular backups of MongoDB
- [ ] Use environment variables for secrets
- [ ] Set up CI/CD pipeline
- [ ] Configure rate limiting
- [ ] Add health checks and monitoring

---

## Quick Reference: Configuration Files

### Backend (.env)

```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
MONGODB_URI=mongodb://mongodb:27017/bakehouse
FRONTEND_URL=https://your-domain.com
```

### Frontend (.env.local)

```bash
VITE_API_URL=https://api.your-domain.com
VITE_WEBSOCKET_URL=https://api.your-domain.com
```

### docker-compose.yml

Update the environment sections with your actual URLs/IPs.

---

## Troubleshooting

### Can't connect from other devices

1. Check firewall settings
2. Verify IP address is correct
3. Ensure Docker ports are mapped: `docker ps`
4. Test with `curl http://YOUR_IP:3001/health`

### WebSocket connection fails

1. Ensure WEBSOCKET_URL matches backend URL
2. Check that Socket.IO CORS is properly configured
3. Verify firewall allows WebSocket connections

### CORS errors

1. Update backend CORS configuration in `server.js`
2. Ensure FRONTEND_URL environment variable is correct
3. Check browser console for specific CORS errors

---

## Need Help?

- Check logs: `docker-compose logs -f`
- Health check: `curl http://YOUR_URL:3001/health`
- Network test: `ping YOUR_IP`
- Port test: `telnet YOUR_IP 3001`
