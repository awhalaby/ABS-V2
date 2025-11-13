# Bakehouse System V2

A comprehensive bakery management system for order processing, demand forecasting, schedule generation, and simulation.

## Overview

The Bakehouse System consists of 6 major components that build upon each other in sequence:

**Data Flow:** Orders → Velocity → Forecast → Intraday → Schedule → Simulation

## Features

1. **Order Loader** - Upload and manage order data
2. **Velocity Dashboard** - Analyze sales patterns (weekly, daily, intraday)
3. **Forecast Engine** - Predict future demand with day-of-week patterns
4. **Intraday Forecast** - Hourly demand predictions
5. **ABS Schedule Generator** - Generate optimal baking schedules
6. **Simulation System** - Test strategies with real-time simulation

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB 7+
- Docker & Docker Compose (optional)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd ABS-V2
```

2. Install dependencies:

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. Start MongoDB (if not using Docker):

```bash
mongod
```

Or use Docker Compose:

```bash
docker-compose up mongodb
```

4. Set up environment variables:

```bash
# Backend .env
cp backend/.env.example backend/.env
# Edit backend/.env with your MongoDB URI
```

5. Seed initial data:

```bash
node scripts/seed-bake-specs.js
```

6. Start the development servers:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

7. Open your browser:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Project Structure

```
ABS-V2/
├── backend/           # Express API server
│   ├── config/       # Configuration files
│   ├── shared/       # Shared utilities and middleware
│   ├── orders/       # Order loader module
│   ├── velocity/     # Velocity dashboard module
│   ├── forecast/     # Forecast engine module
│   └── abs/          # ABS scheduling and simulation
├── frontend/          # React frontend
│   └── src/
│       ├── pages/    # Page components
│       ├── components/ # Reusable components
│       └── utils/    # Frontend utilities
├── scripts/          # Utility scripts
├── tests/            # Test suites
└── docs/             # Documentation
```

## Architecture Principles

1. **Unidirectional Data Flow** - Each phase builds on previous, no backtracking
2. **Single Source of Truth** - State always has one authoritative source
3. **Explicit Status Fields** - Every entity has clear status
4. **Consistent Naming** - Same field names throughout
5. **Array-Based State** - Use arrays instead of nested objects
6. **Separation of Concerns** - Each module has one responsibility

## Development

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Code Style

- Backend: ES6+ modules, async/await
- Frontend: React functional components with hooks
- Use consistent naming conventions (camelCase for variables, PascalCase for components)

## Documentation

- [API Documentation](./docs/api/)
- [Architecture Guide](./docs/architecture/)
- [User Guides](./docs/guides/)

## License

ISC
