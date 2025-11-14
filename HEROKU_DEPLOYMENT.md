# Heroku Deployment Guide

This guide walks you through deploying the Bakehouse ABS application to Heroku.

## Prerequisites

1. **Heroku Account**: Sign up at [heroku.com](https://heroku.com)
2. **Heroku CLI**: Install from [devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli)
3. **Git**: Ensure your code is in a git repository
4. **MongoDB Atlas Account**: Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) (free tier available)

## Deployment Options

You have two options for deployment:

### Option 1: Separate Frontend and Backend (Recommended)

- Backend API on one Heroku app
- Frontend on another Heroku app (or use Vercel/Netlify)
- Better separation of concerns
- Easier to scale independently

### Option 2: Monolith (Backend serves Frontend)

- Single Heroku app serves both API and static frontend
- Simpler deployment
- Lower cost (one dyno instead of two)

This guide covers **Option 1** (separate apps). See the end for Option 2.

---

## Part 1: Setup MongoDB Atlas

Since Heroku doesn't provide a built-in MongoDB service, we'll use MongoDB Atlas (free tier available).

### Step 1: Create MongoDB Atlas Cluster

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up/Login and create a new project
3. Click "Build a Database" → Choose "M0 (Free)" tier
4. Select a cloud provider and region (choose one close to your Heroku region)
5. Name your cluster (e.g., "bakehouse-cluster")
6. Click "Create Cluster"

### Step 2: Configure Database Access

1. In Atlas, go to "Database Access" (left sidebar)
2. Click "Add New Database User"
3. Create a user with username/password (save these credentials!)
4. Set privileges to "Read and write to any database"
5. Click "Add User"

### Step 3: Configure Network Access

1. Go to "Network Access" (left sidebar)
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere" (0.0.0.0/0)
   - **Note**: This is needed for Heroku's dynamic IPs
4. Click "Confirm"

### Step 4: Get Connection String

1. Go to "Database" (left sidebar)
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Copy the connection string (looks like: `mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`)
5. Replace `<password>` with your actual password
6. Add your database name: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/bakehouse?retryWrites=true&w=majority`

---

## Part 2: Deploy Backend to Heroku

### Step 1: Login to Heroku

```bash
heroku login
```

### Step 2: Create Backend App

```bash
# From your project root
heroku create your-bakehouse-backend
```

**Note**: Replace `your-bakehouse-backend` with your desired app name (must be unique across Heroku).

### Step 3: Set Environment Variables

```bash
# Set MongoDB connection string (use your Atlas connection string)
heroku config:set MONGODB_URI="mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/bakehouse?retryWrites=true&w=majority" --app your-bakehouse-backend

# Set Node environment
heroku config:set NODE_ENV=production --app your-bakehouse-backend

# Set HOST to 0.0.0.0 (required for Heroku)
heroku config:set HOST=0.0.0.0 --app your-bakehouse-backend

# Frontend URL (we'll update this after deploying frontend)
heroku config:set FRONTEND_URL="https://your-bakehouse-frontend.herokuapp.com" --app your-bakehouse-backend
```

### Step 4: Create Backend Procfile

Create a `Procfile` in the `backend/` directory:

```bash
cd backend
cat > Procfile << 'EOF'
web: node server.js
EOF
cd ..
```

### Step 5: Update Backend Package.json

The backend `package.json` already has the correct start script, but let's verify:

```json
"scripts": {
  "start": "node server.js"
}
```

### Step 6: Create .slugignore (Optional)

Create `backend/.slugignore` to exclude test files from deployment:

```bash
cat > backend/.slugignore << 'EOF'
test-*.js
*.test.js
__tests__/
EOF
```

### Step 7: Deploy Backend

Since your backend is in a subdirectory, we need to use a buildpack:

```bash
# Add Node.js buildpack
heroku buildpacks:add heroku/nodejs --app your-bakehouse-backend

# Deploy backend subdirectory
git subtree push --prefix backend heroku main
```

**Alternative**: If you get errors with subtree, you can:

```bash
# Add a remote for the backend app
heroku git:remote -a your-bakehouse-backend

# Push only the backend subdirectory
git subtree push --prefix backend heroku main
```

**If you encounter issues**, you might need to use this method:

```bash
# Create a temporary branch with backend at root
git subtree split --prefix backend -b backend-deploy

# Push that branch to heroku
git push heroku backend-deploy:main --app your-bakehouse-backend

# Delete the temporary branch
git branch -D backend-deploy
```

### Step 8: Check Backend Logs

```bash
heroku logs --tail --app your-bakehouse-backend
```

### Step 9: Test Backend

```bash
# Visit the health check endpoint
curl https://your-bakehouse-backend.herokuapp.com/health
```

You should see:

```json
{
  "status": "ok",
  "timestamp": "2025-11-14T...",
  "database": "connected"
}
```

---

## Part 3: Deploy Frontend to Heroku

### Step 1: Create Frontend App

```bash
heroku create your-bakehouse-frontend
```

### Step 2: Configure Frontend for Production

First, update the frontend to use environment variables. Check your `frontend/src/utils/api.js` or similar files to ensure they use `import.meta.env.VITE_API_URL`.

### Step 3: Set Frontend Environment Variables

```bash
# Set backend API URL (use your actual backend URL)
heroku config:set VITE_API_URL="https://your-bakehouse-backend.herokuapp.com" --app your-bakehouse-frontend

# Set WebSocket URL
heroku config:set VITE_WEBSOCKET_URL="https://your-bakehouse-backend.herokuapp.com" --app your-bakehouse-frontend
```

### Step 4: Create Frontend Buildpack Configuration

For Vite apps, we need to use a static buildpack or Node.js with a server.

**Option A: Using Static Buildpack (Simpler)**

```bash
# Set buildpack
heroku buildpacks:set https://github.com/heroku/heroku-buildpack-static.git --app your-bakehouse-frontend
```

Create `frontend/static.json`:

```bash
cat > frontend/static.json << 'EOF'
{
  "root": "dist",
  "clean_urls": true,
  "routes": {
    "/**": "index.html"
  },
  "headers": {
    "/**": {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block"
    },
    "/assets/**": {
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  }
}
EOF
```

**Option B: Using Node.js with Express Server (More Control)**

Update `frontend/package.json` to add:

```json
"scripts": {
  "start": "node server.js",
  "build": "vite build",
  "heroku-postbuild": "npm run build"
}
```

Create `frontend/server.js`:

```javascript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.URL);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, "dist")));

// Handle React routing - return all requests to React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Frontend server running on port ${PORT}`);
});
```

Add express to dependencies:

```bash
cd frontend
npm install express
cd ..
```

### Step 5: Deploy Frontend

```bash
# Deploy frontend subdirectory
git subtree push --prefix frontend heroku main

# Or using the alternative method:
git subtree split --prefix frontend -b frontend-deploy
git push heroku frontend-deploy:main --app your-bakehouse-frontend
git branch -D frontend-deploy
```

### Step 6: Update Backend FRONTEND_URL

Now that your frontend is deployed, update the backend's FRONTEND_URL:

```bash
heroku config:set FRONTEND_URL="https://your-bakehouse-frontend.herokuapp.com" --app your-bakehouse-backend

# Restart backend
heroku restart --app your-bakehouse-backend
```

### Step 7: Test Frontend

Open your browser and visit:

```
https://your-bakehouse-frontend.herokuapp.com
```

---

## Part 4: Seed Database (Optional)

If you need to seed your database with initial data:

```bash
# Run a one-off dyno to execute the seed script
heroku run node scripts/seed-bake-specs.js --app your-bakehouse-backend
```

---

## Part 5: Configure WebSockets for Heroku

Heroku requires special configuration for WebSockets. Update your backend `server.js` if needed:

The current configuration should work, but ensure:

1. Socket.io is configured to allow your frontend domain
2. Use `https://` for production URLs (Heroku provides SSL)
3. WebSocket transport is enabled

Your current setup should work! But if you have issues, you may need to add:

```javascript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"], // Important for Heroku
  allowEIO3: true,
});
```

---

## Part 6: Monitor and Manage

### View Logs

```bash
# Backend logs
heroku logs --tail --app your-bakehouse-backend

# Frontend logs
heroku logs --tail --app your-bakehouse-frontend
```

### Open Apps

```bash
heroku open --app your-bakehouse-backend
heroku open --app your-bakehouse-frontend
```

### Scale Dynos (if needed)

```bash
# Scale to multiple dynos (requires paid plan)
heroku ps:scale web=2 --app your-bakehouse-backend
```

### View App Info

```bash
heroku info --app your-bakehouse-backend
heroku config --app your-bakehouse-backend
```

---

## Troubleshooting

### Issue: Application Error on Heroku

**Solution**: Check logs with `heroku logs --tail --app your-app-name`

Common issues:

- Missing environment variables
- Incorrect `Procfile`
- Port binding (must use `process.env.PORT`)

### Issue: Database Connection Fails

**Solution**:

- Verify MongoDB Atlas connection string
- Check if IP whitelist includes 0.0.0.0/0
- Test connection string locally first

### Issue: WebSockets Not Working

**Solution**:

- Ensure you're using `https://` URLs (not `http://`)
- Check CORS configuration in backend
- Verify Socket.io transports include both 'websocket' and 'polling'

### Issue: Frontend Can't Connect to Backend

**Solution**:

- Verify `VITE_API_URL` is set correctly
- Check CORS settings on backend allow your frontend domain
- Check browser console for CORS errors

### Issue: Git Subtree Push Fails

**Solution**: Use the split method:

```bash
git subtree split --prefix backend -b temp-backend
git push heroku temp-backend:main --app your-bakehouse-backend
git branch -D temp-backend
```

---

## Alternative: Option 2 - Monolith Deployment

To deploy frontend and backend together:

### Step 1: Restructure Project

Move frontend build into backend:

Update root `package.json`:

```json
{
  "name": "bakehouse-monolith",
  "version": "1.0.0",
  "scripts": {
    "install-all": "cd backend && npm install && cd ../frontend && npm install",
    "build": "cd frontend && npm run build",
    "start": "cd backend && npm start",
    "heroku-postbuild": "npm run install-all && npm run build"
  }
}
```

### Step 2: Update Backend to Serve Frontend

Update `backend/server.js` to serve the frontend build:

```javascript
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ... existing middleware ...

// Serve frontend static files (add before API routes)
const frontendDist = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));

// API Routes
app.use("/api/orders", ordersRouter);
// ... other routes ...

// Serve frontend for all other routes (add after API routes, before error handlers)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// 404 handler for API only
// Remove or modify existing notFoundHandler
```

### Step 3: Create Root Procfile

```
web: cd backend && node server.js
```

### Step 4: Deploy

```bash
heroku create your-bakehouse-app
heroku config:set MONGODB_URI="your-mongo-uri" --app your-bakehouse-app
heroku config:set NODE_ENV=production --app your-bakehouse-app
git push heroku main
```

---

## Continuous Deployment with GitHub

To set up automatic deployments:

1. Connect your Heroku app to GitHub:

   - Go to Heroku Dashboard → Your App → Deploy
   - Choose "GitHub" as deployment method
   - Connect your repository
   - Enable "Automatic Deploys" from main branch

2. Each push to main will automatically deploy

---

## Cost Considerations

### Free Tier

- 2 apps = 2 free dynos (sleep after 30 min of inactivity)
- MongoDB Atlas: M0 cluster (512MB, free forever)
- Total: **$0/month**

### Paid Options

- Eco dynos: $5/month each (don't sleep)
- Basic dyno: $7/month each
- MongoDB Atlas M10: $0.08/hour (~$57/month)

---

## Security Checklist

- [ ] Environment variables are set (not hardcoded)
- [ ] MongoDB Atlas has proper user authentication
- [ ] CORS is configured to allow only your frontend domain
- [ ] Using HTTPS for all connections
- [ ] Database connection string is not in git history
- [ ] Consider adding rate limiting to API endpoints

---

## Next Steps

1. Set up custom domain names
2. Configure SSL certificates (Heroku provides free SSL)
3. Set up monitoring and alerts
4. Configure CI/CD pipeline
5. Set up staging environment

---

## Useful Commands

```bash
# View current dynos
heroku ps --app your-app-name

# Restart app
heroku restart --app your-app-name

# Access Rails/Node console
heroku run bash --app your-app-name

# View environment variables
heroku config --app your-app-name

# Set environment variable
heroku config:set KEY=value --app your-app-name

# Scale dynos
heroku ps:scale web=1 --app your-app-name
```

---

## Support

- Heroku Dev Center: [devcenter.heroku.com](https://devcenter.heroku.com)
- MongoDB Atlas Docs: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- Heroku CLI Reference: [devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli)

---

**Good luck with your deployment! 🚀**
