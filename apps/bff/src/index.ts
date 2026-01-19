/**
 * @fileoverview Main entry point for the BFF (Backend-for-Frontend) server
 *
 * WHAT THIS FILE DOES:
 * This is the starting point of the server. It:
 * 1. Creates an Express application
 * 2. Configures middleware (logging, static files)
 * 3. Registers API routes
 * 4. Sets up SSR (Server-Side Rendering)
 * 5. Starts listening for requests
 *
 * ARCHITECTURE OVERVIEW:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        Express Server                           │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  1. Request Logger     - Logs all incoming requests             │
 * │  2. Static Middleware  - Serves JS, CSS, images                 │
 * │  3. API Routes         - /api/bootstrap, /api/todos, etc.       │
 * │  4. SSR Handler        - Renders React for all other routes     │
 * │  5. 404 Handler        - Catches unmatched requests             │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * REQUEST FLOW:
 * 1. Browser requests /todos
 * 2. Request logger records the request
 * 3. Static middleware checks if it's a file (no)
 * 4. API routes check if it matches (no)
 * 5. SSR handler renders the page with React
 * 6. Response sent to browser
 * 7. Request logger logs completion with timing
 *
 * FILE ORGANIZATION:
 * - src/index.ts           - This file (app setup)
 * - src/http/              - HTTP layer (routes, middleware, caching)
 * - src/server/            - Server logic (bootstrap, caching, SSR)
 * - src/server/external/   - External API calls
 * - src/server/ssr/        - React server rendering
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Server utilities
import { getPort } from "./server/env.js";

// HTTP layer
import { requestLogger, setStaticHeaders } from "./http/middleware.js";
import { registerRoutes } from "./http/routes.js";
import { createSsrHandler, create404Handler } from "./http/ssrHandler.js";

// ============================================================================
// PATH RESOLUTION
// ============================================================================

/**
 * In ES Modules, __dirname and __filename don't exist.
 * We recreate them using import.meta.url.
 *
 * WHY WE NEED THIS:
 * To serve static files, we need absolute paths. These work whether
 * we're running from src/ (development) or dist/ (production).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to the BFF root directory (apps/bff/).
 * From src/ or dist/, go one level up.
 */
const bffRootDir = path.resolve(__dirname, "..");

/**
 * Path to static assets (apps/bff/static/).
 * This is where webpack outputs the built frontend.
 */
const staticDir = path.join(bffRootDir, "static");

// ============================================================================
// APPLICATION SETUP
// ============================================================================

const app = express();
const port = getPort();

// ============================================================================
// MIDDLEWARE STACK
// ============================================================================

/**
 * 1. REQUEST LOGGING
 *
 * Logs all requests with method, URL, status, and duration.
 * Must be first so it captures all requests.
 */
app.use(requestLogger());

/**
 * 2. STATIC FILE SERVING
 *
 * Serves files from the static directory (JS, CSS, images).
 * Options:
 * - index: false - Don't auto-serve index.html for directories
 * - setHeaders - Custom cache headers for different file types
 */
app.use(
  express.static(staticDir, {
    index: false, // We handle index via SSR
    setHeaders: (res, filePath) => {
      setStaticHeaders({ filePath, res });
    },
  })
);

// ============================================================================
// ROUTES
// ============================================================================

/**
 * 3. API ROUTES
 *
 * Registers all /api/* endpoints:
 * - GET /api/bootstrap - Initial page data
 * - GET /api/todos - Todo list
 * - GET /api/hello - Test endpoint
 * - GET /health - Health check
 */
registerRoutes(app);

/**
 * 4. SSR HANDLER
 *
 * Catches all other GET requests and renders them with React.
 * This enables client-side routing to work with server rendering.
 *
 * NOTE: Express 5 requires named wildcard parameters.
 * The syntax "{*path}" captures everything after "/" into req.params.path
 */
app.get("/{*path}", createSsrHandler(staticDir));

/**
 * 5. 404 HANDLER
 *
 * If nothing else matched, return 404 page.
 * This catches requests for non-existent files.
 */
app.use(create404Handler(staticDir));

// ============================================================================
// START SERVER
// ============================================================================

app.listen(port, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    BFF Server Started                         ║
╠═══════════════════════════════════════════════════════════════╣
║  URL:     http://localhost:${port}                              ║
║  Static:  ${staticDir}
║  Mode:    ${process.env.NODE_ENV || "development"}                                    ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
