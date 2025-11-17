import axios from "axios";
import { API_BASE_URL } from "../config/constants.js";

/**
 * Centralized API client with interceptors
 */

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    // const token = localStorage.getItem("token");
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 400:
          console.error("Bad Request:", data);
          break;
        case 401:
          console.error("Unauthorized");
          break;
        case 403:
          console.error("Forbidden");
          break;
        case 404:
          console.error("Not Found");
          break;
        case 500:
          console.error("Server Error:", data);
          break;
        default:
          console.error("API Error:", data);
      }

      return Promise.reject({
        status,
        message: data?.error?.message || "An error occurred",
        details: data?.error?.details,
      });
    } else if (error.request) {
      // Request made but no response - likely connection issue
      console.error("No response received:", error.request);
      const backendURL = api.defaults.baseURL;
      return Promise.reject({
        status: 0,
        message: `Cannot connect to backend server at ${backendURL}. Please check:
1. The backend server is running
2. You're on the same network as the server
3. The backend URL is correct (currently: ${backendURL})
4. Firewall settings allow connections`,
        backendURL,
      });
    } else {
      // Error setting up request
      console.error("Request setup error:", error.message);
      return Promise.reject({
        status: 0,
        message: error.message,
      });
    }
  }
);

// API endpoint functions
// These will be implemented as modules are added

// Orders API
export const ordersAPI = {
  load: (formData) =>
    api.post("/api/orders/load", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  getStats: (startDate, endDate) =>
    api.get("/api/orders/stats", { params: { startDate, endDate } }),
  getDateRanges: () => api.get("/api/orders/date-ranges"),
  deleteRange: (startDate, endDate) =>
    api.delete("/api/orders/range", { params: { startDate, endDate } }),
  deleteAll: () => api.delete("/api/orders/all"),
};

// Velocity API
export const velocityAPI = {
  getWeekly: (startDate, endDate) =>
    api.get("/api/velocity/weekly", { params: { startDate, endDate } }),
  getDaily: (startDate, endDate, sku) =>
    api.get("/api/velocity/daily", { params: { startDate, endDate, sku } }),
  getIntraday: (itemGuid, date, interval) =>
    api.get("/api/velocity/intraday", { params: { itemGuid, date, interval } }),
};

// Forecast API
export const forecastAPI = {
  generate: (params) => api.post("/api/forecast/generate", params),
  getCached: (params) => api.get("/api/forecast/cached", { params }),
  clearCache: (params) => api.delete("/api/forecast/cache", { params }),
};

// ABS Schedule API
export const scheduleAPI = {
  generate: (params) => api.post("/api/abs/schedule/generate", params),
  getByDate: (date) => api.get(`/api/abs/schedule/${date}`),
  list: (filters) => api.get("/api/abs/schedule", { params: filters }),
  update: (id, updates) => api.put(`/api/abs/schedule/${id}`, updates),
  delete: (id) => api.delete(`/api/abs/schedule/${id}`),
  moveBatch: (scheduleId, batchId, newStartTime, newRack) =>
    api.post("/api/abs/batch/move", {
      scheduleId,
      batchId,
      newStartTime,
      newRack,
    }),
  getEarliestDate: () => api.get("/api/abs/earliest-date"),
};

// Bake Specs API
export const bakespecsAPI = {
  getAll: (filters) => api.get("/api/bakespecs", { params: filters }),
  getByItemGuid: (itemGuid) => api.get(`/api/bakespecs/${itemGuid}`),
  createOrUpdate: (bakeSpec) => api.post("/api/bakespecs", bakeSpec),
  update: (itemGuid, bakeSpec) =>
    api.put(`/api/bakespecs/${itemGuid}`, bakeSpec),
  delete: (itemGuid) => api.delete(`/api/bakespecs/${itemGuid}`),
  bulkUpdate: (bakeSpecs) => api.post("/api/bakespecs/bulk", { bakeSpecs }),
  getOvenConfig: () => api.get("/api/bakespecs/oven-config"),
};

// Simulation API
export const simulationAPI = {
  start: (config) => api.post("/api/abs/simulation/start", config),
  pause: (id) => api.post(`/api/abs/simulation/${id}/pause`),
  resume: (id) => api.post(`/api/abs/simulation/${id}/resume`),
  stop: (id) => api.post(`/api/abs/simulation/${id}/stop`),
  getStatus: (id) => api.get(`/api/abs/simulation/${id}/status`),
  getResults: (id) => api.get(`/api/abs/simulation/${id}/results`),
  getAvailableDates: () => api.get("/api/abs/simulation/available-dates"),
  // POS API (manual mode only)
  getAvailableItems: (id) => api.get(`/api/abs/simulation/${id}/pos/items`),
  purchaseItems: (id, items) =>
    api.post(`/api/abs/simulation/${id}/pos/purchase`, { items }),
  // Batch operations
  deleteBatch: (id, batchId) =>
    api.delete(`/api/abs/simulation/${id}/batch/${batchId}`),
  moveBatch: (id, batchId, newStartTime, newRack) =>
    api.post(`/api/abs/simulation/${id}/batch/move`, {
      batchId,
      newStartTime,
      newRack,
    }),
  addBatch: (id, batchData) =>
    api.post(`/api/abs/simulation/${id}/batch/add`, batchData),
  getSuggestedBatches: (id) =>
    api.get(`/api/abs/simulation/${id}/suggested-batches`),
  // Catering orders
  createCateringOrder: (id, orderData) =>
    api.post(`/api/abs/simulation/${id}/catering-order`, orderData),
  approveCateringOrder: (id, orderId) =>
    api.post(`/api/abs/simulation/${id}/catering-order/${orderId}/approve`),
  rejectCateringOrder: (id, orderId) =>
    api.post(`/api/abs/simulation/${id}/catering-order/${orderId}/reject`),
  getCateringOrders: (id) =>
    api.get(`/api/abs/simulation/${id}/catering-orders`),
  setAutoApproveCatering: (id, enabled) =>
    api.post(`/api/abs/simulation/${id}/catering-order/auto-approve`, {
      enabled,
    }),
};
