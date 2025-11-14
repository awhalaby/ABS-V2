# Heroku Deployment - Quick Reference

## Prerequisites Setup (One Time)

```bash
# 1. Install Heroku CLI
# macOS: brew tap heroku/brew && brew install heroku
# Or download from: https://devcenter.heroku.com/articles/heroku-cli

# 2. Login to Heroku
heroku login

# 3. Setup MongoDB Atlas (free tier)
# Go to: https://www.mongodb.com/cloud/atlas
# Create cluster, get connection string
```

## Initial Deployment (First Time)

### Backend Setup

```bash
# Create backend app
heroku create your-bakehouse-backend

# Set environment variables
heroku config:set MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/bakehouse" --app your-bakehouse-backend
heroku config:set NODE_ENV=production --app your-bakehouse-backend
heroku config:set HOST=0.0.0.0 --app your-bakehouse-backend
heroku config:set FRONTEND_URL="https://your-frontend.herokuapp.com" --app your-bakehouse-backend

# Deploy backend
git subtree split --prefix backend -b backend-temp
git push https://git.heroku.com/your-bakehouse-backend.git backend-temp:main
git branch -D backend-temp

# Check health
heroku open --app your-bakehouse-backend
# Visit: /health endpoint
```

### Frontend Setup

```bash
# Create frontend app
heroku create your-bakehouse-frontend

# Add buildpack for static site
heroku buildpacks:set https://github.com/heroku/heroku-buildpack-static.git --app your-bakehouse-frontend

# Set environment variables
heroku config:set VITE_API_URL="https://your-bakehouse-backend.herokuapp.com" --app your-bakehouse-frontend
heroku config:set VITE_WEBSOCKET_URL="https://your-bakehouse-backend.herokuapp.com" --app your-bakehouse-frontend

# Deploy frontend
git subtree split --prefix frontend -b frontend-temp
git push https://git.heroku.com/your-bakehouse-frontend.git frontend-temp:main
git branch -D frontend-temp

# Open app
heroku open --app your-bakehouse-frontend
```

## Update Deployment (After Changes)

### Option 1: Using the Helper Script (Easiest)

```bash
./deploy-heroku.sh
# Follow the prompts
```

### Option 2: Manual Deployment

```bash
# Deploy backend
git subtree split --prefix backend -b backend-temp
git push https://git.heroku.com/your-bakehouse-backend.git backend-temp:main --force
git branch -D backend-temp

# Deploy frontend
git subtree split --prefix frontend -b frontend-temp
git push https://git.heroku.com/your-bakehouse-frontend.git frontend-temp:main --force
git branch -D frontend-temp
```

## Common Commands

```bash
# View logs (real-time)
heroku logs --tail --app your-app-name

# View config
heroku config --app your-app-name

# Set config variable
heroku config:set KEY=value --app your-app-name

# Restart app
heroku restart --app your-app-name

# Open app in browser
heroku open --app your-app-name

# Run command in dyno
heroku run bash --app your-app-name

# Seed database
heroku run node scripts/seed-bake-specs.js --app your-bakehouse-backend

# View app info
heroku apps:info --app your-app-name

# View dyno status
heroku ps --app your-app-name
```

## Troubleshooting

### App crashes or shows "Application Error"

```bash
# Check logs
heroku logs --tail --app your-app-name

# Common fixes:
# - Verify all environment variables are set
# - Check MongoDB connection string
# - Ensure Procfile exists and is correct
```

### Database connection fails

```bash
# Test connection string locally first
# Verify MongoDB Atlas:
# - IP whitelist includes 0.0.0.0/0
# - Database user credentials are correct
# - Connection string includes database name
```

### WebSocket issues

```bash
# Ensure using https:// (not http://)
# Check CORS settings in backend
# Verify Socket.io configuration
```

### Cannot find module errors

```bash
# Ensure package.json has all dependencies (not in devDependencies)
# Check that "type": "module" is set for ES modules
```

## Environment Variables Reference

### Backend

- `MONGODB_URI` - MongoDB connection string (required)
- `NODE_ENV` - Set to "production" (required)
- `HOST` - Set to "0.0.0.0" (required for Heroku)
- `FRONTEND_URL` - Your frontend URL for CORS (required)
- `PORT` - Automatically set by Heroku

### Frontend

- `VITE_API_URL` - Backend API URL (required)
- `VITE_WEBSOCKET_URL` - Backend WebSocket URL (required)

## Costs

### Free Tier (Current)

- 2 apps × free dynos (sleep after 30 min)
- MongoDB Atlas M0 (512MB free)
- Total: **$0/month**

### Eco Tier (No Sleep)

- 2 apps × $5/month
- Total: **$10/month** + MongoDB

## File Checklist

- [x] `backend/Procfile` - Created
- [x] `backend/.slugignore` - Created
- [x] `frontend/static.json` - Created
- [x] `backend/server.js` - Updated for Heroku
- [x] `deploy-heroku.sh` - Deployment script
- [x] `HEROKU_DEPLOYMENT.md` - Full guide
- [x] `HEROKU_QUICK_REFERENCE.md` - This file

## Next Steps After Deployment

1. **Test the application** - Visit both URLs and test functionality
2. **Monitor logs** - Watch for any errors
3. **Set up custom domains** (optional)
4. **Configure SSL** (automatic with Heroku)
5. **Set up staging environment** (optional)
6. **Enable automatic deploys** from GitHub

## Support Links

- [Heroku Dev Center](https://devcenter.heroku.com)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com)
- [Heroku CLI Reference](https://devcenter.heroku.com/articles/heroku-cli-commands)
