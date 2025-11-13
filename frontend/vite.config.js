import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // HMR configuration for network access
    hmr: {
      host: "10.1.10.112",
      port: 5173,
    },
    // Proxy removed - using VITE_API_URL environment variable instead
    // This allows the frontend to work correctly when accessed from other computers
  },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(
      process.env.VITE_API_URL || "http://10.1.10.112:3001"
    ),
    "import.meta.env.VITE_WEBSOCKET_URL": JSON.stringify(
      process.env.VITE_WEBSOCKET_URL || "http://10.1.10.112:3001"
    ),
  },
});
