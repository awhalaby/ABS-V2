import { HTTP_STATUS } from "../../config/constants.js";

/**
 * Centralized error handling middleware
 */

/**
 * Error handler middleware for Express
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandler(err, req, res, next) {
  console.error("Error:", err);

  // Default error
  let status =
    err.status || err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = err.message || "Internal server error";
  let details = err.details || null;

  // Validation errors
  if (err.name === "ValidationError") {
    status = HTTP_STATUS.BAD_REQUEST;
    message = "Validation error";
    details = err.errors || err.message;
  }

  // MongoDB errors
  if (err.name === "MongoError" || err.name === "MongoServerError") {
    if (err.code === 11000) {
      status = HTTP_STATUS.BAD_REQUEST;
      message = "Duplicate entry";
      details = "A record with this value already exists";
    } else {
      status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
      message = "Database error";
    }
  }

  // Cast errors (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    status = HTTP_STATUS.BAD_REQUEST;
    message = "Invalid ID format";
  }

  // Send error response
  const response = {
    success: false,
    error: {
      message,
      ...(details && { details }),
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  };

  res.status(status).json(response);
}

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function notFoundHandler(req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}

/**
 * Async error wrapper - wraps async route handlers to catch errors
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
