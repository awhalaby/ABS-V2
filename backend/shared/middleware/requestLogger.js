/**
 * Request logging middleware
 */

/**
 * Request logger middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);

  // Log request body in development
  if (
    process.env.NODE_ENV === "development" &&
    req.body &&
    Object.keys(req.body).length > 0
  ) {
    console.log("Request body:", JSON.stringify(req.body, null, 2));
  }

  // Log query parameters
  if (req.query && Object.keys(req.query).length > 0) {
    console.log("Query params:", req.query);
  }

  // Capture response finish
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusColor =
      res.statusCode >= 400 ? "🔴" : res.statusCode >= 300 ? "🟡" : "🟢";

    console.log(
      `${statusColor} [${new Date().toISOString()}] ${req.method} ${
        req.path
      } - ${res.statusCode} - ${duration}ms`
    );

    // Log response body in development for errors
    if (process.env.NODE_ENV === "development" && res.statusCode >= 400) {
      // Note: Response body logging would require intercepting res.json/res.send
      // This is a simplified version
    }
  });

  next();
}
