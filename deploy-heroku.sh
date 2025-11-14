#!/bin/bash

# Heroku Deployment Helper Script
# This script simplifies deploying backend and frontend to Heroku

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Heroku Deployment Helper${NC}"
echo ""

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo -e "${RED}❌ Heroku CLI is not installed${NC}"
    echo "Please install it from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Check if logged into Heroku
if ! heroku auth:whoami &> /dev/null; then
    echo -e "${RED}❌ Not logged into Heroku${NC}"
    echo "Please run: heroku login"
    exit 1
fi

echo -e "${GREEN}✅ Heroku CLI is ready${NC}"
echo ""

# Function to deploy backend
deploy_backend() {
    echo -e "${YELLOW}📦 Deploying Backend...${NC}"
    
    if [ -z "$BACKEND_APP_NAME" ]; then
        echo -e "${RED}❌ BACKEND_APP_NAME not set${NC}"
        exit 1
    fi
    
    echo "Deploying to: $BACKEND_APP_NAME"
    
    # Check if app exists
    if ! heroku apps:info --app "$BACKEND_APP_NAME" &> /dev/null; then
        echo -e "${YELLOW}⚠️  App '$BACKEND_APP_NAME' doesn't exist. Create it first with:${NC}"
        echo "heroku create $BACKEND_APP_NAME"
        exit 1
    fi
    
    # Deploy using git subtree
    echo "Pushing backend code..."
    git subtree split --prefix backend -b backend-deploy-temp
    git push https://git.heroku.com/$BACKEND_APP_NAME.git backend-deploy-temp:main --force
    git branch -D backend-deploy-temp
    
    echo -e "${GREEN}✅ Backend deployed successfully!${NC}"
    echo "View logs: heroku logs --tail --app $BACKEND_APP_NAME"
    echo "Open app: heroku open --app $BACKEND_APP_NAME"
    echo ""
}

# Function to deploy frontend
deploy_frontend() {
    echo -e "${YELLOW}📦 Deploying Frontend...${NC}"
    
    if [ -z "$FRONTEND_APP_NAME" ]; then
        echo -e "${RED}❌ FRONTEND_APP_NAME not set${NC}"
        exit 1
    fi
    
    echo "Deploying to: $FRONTEND_APP_NAME"
    
    # Check if app exists
    if ! heroku apps:info --app "$FRONTEND_APP_NAME" &> /dev/null; then
        echo -e "${YELLOW}⚠️  App '$FRONTEND_APP_NAME' doesn't exist. Create it first with:${NC}"
        echo "heroku create $FRONTEND_APP_NAME"
        exit 1
    fi
    
    # Deploy using git subtree
    echo "Pushing frontend code..."
    git subtree split --prefix frontend -b frontend-deploy-temp
    git push https://git.heroku.com/$FRONTEND_APP_NAME.git frontend-deploy-temp:main --force
    git branch -D frontend-deploy-temp
    
    echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
    echo "View logs: heroku logs --tail --app $FRONTEND_APP_NAME"
    echo "Open app: heroku open --app $FRONTEND_APP_NAME"
    echo ""
}

# Main menu
echo "What would you like to deploy?"
echo "1) Backend only"
echo "2) Frontend only"
echo "3) Both (Backend first, then Frontend)"
echo "4) Exit"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        read -p "Enter your backend app name: " BACKEND_APP_NAME
        deploy_backend
        ;;
    2)
        read -p "Enter your frontend app name: " FRONTEND_APP_NAME
        deploy_frontend
        ;;
    3)
        read -p "Enter your backend app name: " BACKEND_APP_NAME
        read -p "Enter your frontend app name: " FRONTEND_APP_NAME
        deploy_backend
        sleep 2
        deploy_frontend
        ;;
    4)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}🎉 Deployment complete!${NC}"

