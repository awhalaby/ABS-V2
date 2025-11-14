import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database.js";
import { requestLogger } from "./shared/middleware/requestLogger.js";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middleware/errorHandler.js";
import ordersRouter from "./orders/router.js";
import velocityRouter from "./velocity/router.js";
import forecastRouter from "./forecast/router.js";
import absRouter from "./abs/router.js";
import bakespecsRouter from "./bakespecs/router.js";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;
// For Heroku and production, use 0.0.0.0 to bind to all interfaces
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost");
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/bakehouse";

// Middleware
// CORS configuration to allow access from other machines
app.use(
  cors({
    origin: true, // Allow all origins in development. For production, specify allowed origins.
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health check endpoint
app.get("/health", async (req, res) => {
  const { healthCheck } = await import("./config/database.js");
  const dbHealthy = await healthCheck();

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: dbHealthy ? "connected" : "disconnected",
  });
});

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("joinSimulation", (simulationId) => {
    socket.join(`simulation:${simulationId}`);
    console.log(`Client ${socket.id} joined simulation: ${simulationId}`);
  });

  socket.on("leaveSimulation", (simulationId) => {
    socket.leave(`simulation:${simulationId}`);
    console.log(`Client ${socket.id} left simulation: ${simulationId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Start simulation update loop
(async () => {
  const { updateAllSimulations } = await import("./abs/simulation/service.js");
  // Update simulations every 100ms for smooth time progression
  // At 120x speed: 100ms real time = 12 seconds simulation time = 0.2 minutes
  setInterval(() => {
    updateAllSimulations(io);
  }, 100);
})();

// API Routes
app.use("/api/orders", ordersRouter);
app.use("/api/velocity", velocityRouter);
app.use("/api/forecast", forecastRouter);
app.use("/api/abs", absRouter);
app.use("/api/bakespecs", bakespecsRouter);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase(MONGODB_URI);

    // Start HTTP server
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`📡 WebSocket server ready`);
      console.log(`📊 Health check: http://${HOST}:${PORT}/health`);
      if (HOST === "0.0.0.0") {
        console.log(
          `\n🌐 For local network access, use your machine's IP address`
        );
        console.log(`   Example: http://192.168.1.x:${PORT}`);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  const { closeDatabase } = await import("./config/database.js");
  await closeDatabase();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  const { closeDatabase } = await import("./config/database.js");
  await closeDatabase();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

startServer();

// Export io for use in other modules
export { io };
