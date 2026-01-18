/**
 * @fileoverview Express middleware for the BFF server
 *
 * WHAT IS MIDDLEWARE?
 * Middleware are functions that run before your route handlers. They can:
 * - Modify the request/response objects
 * - End the request-response cycle
 * - Call the next middleware in the stack
 *
 * Think of middleware like layers of an onion - each request passes through
 * each layer before reaching the actual route handler.
 *
 * ORDER MATTERS:
 * Middleware runs in the order you add it to Express. For example:
 * 1. Logging middleware (logs all requests)
 * 2. Static file middleware (serves files, ends cycle if file exists)
 * 3. Route handlers (your API endpoints)
 * 4. Error handlers (catch any errors)
 */

import type { Request, Response, NextFunction } from "express";

// ============================================================================
// REQUEST LOGGING
// ============================================================================

/**
 * Logs all HTTP requests with timing information.
 *
 * WHY LOG REQUESTS?
 * - Debugging: See what requests are coming in
 * - Performance: Identify slow endpoints
 * - Security: Track suspicious activity
 *
 * OUTPUT FORMAT:
 * GET /api/todos 200 12.34ms
 * POST /api/users 201 45.67ms
 *
 * HOW IT WORKS:
 * 1. Records start time when request begins
 * 2. Attaches listener to response 'finish' event
 * 3. When response completes, calculates duration and logs
 *
 * @returns Express middleware function
 *
 * @example
 * app.use(requestLogger());
 * // All subsequent routes will be logged
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Record when request started
    const start = process.hrtime.bigint();

    // When response finishes, log the request
    res.on("finish", () => {
      const end = process.hrtime.bigint();

      // Convert nanoseconds to milliseconds
      const durationMs = Number(end - start) / 1_000_000;

      console.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(2)}ms`
      );
    });

    // Continue to next middleware
    next();
  };
}

// ============================================================================
// STATIC FILE HEADERS
// ============================================================================

/**
 * Configuration for static file cache headers.
 *
 * Different file types need different caching strategies:
 * - HTML: No caching (always get latest)
 * - Hashed assets: Cache forever (hash changes = new URL)
 * - Other files: Short cache (logos, favicons, etc.)
 */
export type StaticHeadersConfig = {
  /** File path being served */
  filePath: string;
  /** Express response object */
  res: Response;
};

/**
 * Sets appropriate cache headers for static files.
 *
 * CACHING STRATEGIES:
 *
 * 1. HTML FILES (index.html, 404.html)
 *    Cache-Control: no-store
 *    - Always fetch fresh HTML
 *    - HTML references hashed assets, so we need latest version
 *
 * 2. HASHED ASSETS (/assets/app.abc123.js)
 *    Cache-Control: public, max-age=31536000, immutable
 *    - Cache for 1 year
 *    - "immutable" tells browser content will never change
 *    - Safe because hash changes when content changes
 *
 * 3. OTHER FILES (favicon.ico, robots.txt)
 *    Cache-Control: public, max-age=3600
 *    - Cache for 1 hour
 *    - Balance between freshness and performance
 *
 * @param config - File path and response object
 *
 * @example
 * app.use(express.static(dir, {
 *   setHeaders: (res, filePath) => setStaticHeaders({ filePath, res })
 * }));
 */
export function setStaticHeaders({ filePath, res }: StaticHeadersConfig): void {
  const path = require("path");
  const filename = path.basename(filePath);

  // Always include Vary header for correct caching with compression
  res.setHeader("Vary", "Accept-Encoding");

  // HTML entry points - never cache
  if (filename === "index.html" || filename === "404.html") {
    res.setHeader("Cache-Control", "no-store");
    return;
  }

  // Hashed assets in /assets/ folder - cache forever
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  // Everything else - moderate caching
  res.setHeader("Cache-Control", "public, max-age=3600");
}
