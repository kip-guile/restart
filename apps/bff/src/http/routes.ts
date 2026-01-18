/**
 * @fileoverview API route definitions for the BFF server
 *
 * WHAT IS A BFF (Backend-for-Frontend)?
 * A BFF is a server specifically designed to serve a frontend application.
 * Instead of the frontend calling multiple microservices directly, it calls
 * the BFF, which:
 * - Aggregates data from multiple sources
 * - Formats data specifically for the frontend
 * - Handles authentication/authorization
 * - Provides caching
 *
 * ROUTE ORGANIZATION:
 * Routes are grouped by purpose:
 * - /api/bootstrap - Initial page data for SSR
 * - /api/todos - Todo CRUD operations
 * - /api/hello - Simple test endpoint
 * - /health - Health check for load balancers
 */

import type { Express, Request, Response } from "express";
import { buildRequestContext } from "../server/requestContext.js";
import { getBootstrapPayload, getTodos } from "../server/bootstrap.js";
import { createHttpClient } from "../server/httpClient.js";
import { applyCachePolicy } from "./cachePolicy.js";

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

/**
 * Registers all API routes on the Express app.
 *
 * WHY SEPARATE FUNCTION?
 * Keeping route definitions in a separate file:
 * - Makes index.ts cleaner and focused on app setup
 * - Makes routes easier to find and modify
 * - Enables easier testing (can test routes in isolation)
 *
 * @param app - Express application instance
 *
 * @example
 * const app = express();
 * registerRoutes(app);
 * app.listen(3000);
 */
export function registerRoutes(app: Express): void {
  // Register each group of routes
  registerBootstrapRoutes(app);
  registerTodoRoutes(app);
  registerUtilityRoutes(app);
}

// ============================================================================
// BOOTSTRAP ROUTES
// ============================================================================

/**
 * Registers the bootstrap API endpoint.
 *
 * The bootstrap endpoint provides initial data for SSR hydration.
 * The client calls this when navigating client-side (after initial load).
 */
function registerBootstrapRoutes(app: Express): void {
  /**
   * GET /api/bootstrap
   *
   * Returns bootstrap payload for a given route.
   *
   * Query Parameters:
   * - path: The route to get bootstrap data for (default: "/")
   *
   * Response:
   * - 200: Bootstrap payload JSON
   *
   * Example:
   * GET /api/bootstrap?path=/todos
   * -> { route: "/todos", greeting: "Welcome", page: { kind: "todos", todos: [...] } }
   */
  app.get("/api/bootstrap", async (req: Request, res: Response) => {
    // Extract route from query string, default to home page
    const route = typeof req.query.path === "string" ? req.query.path : "/";

    // Build request context with user info, request ID, etc.
    const ctx = buildRequestContext(req, route);

    // Set cache headers based on authentication status
    applyCachePolicy(req, res, "bootstrap");

    // Generate and return bootstrap payload
    const payload = await getBootstrapPayload(ctx);
    res.status(200).json(payload);
  });
}

// ============================================================================
// TODO ROUTES
// ============================================================================

/**
 * Registers todo-related API endpoints.
 *
 * These endpoints are used by RTK Query for client-side data fetching
 * after the initial page load.
 */
function registerTodoRoutes(app: Express): void {
  /**
   * GET /api/todos
   *
   * Returns list of todos from external API.
   *
   * Response:
   * - 200: Array of todo objects
   * - 500: Error object with code and message
   *
   * Example:
   * GET /api/todos
   * -> [{ id: 1, title: "Learn TypeScript", completed: false }, ...]
   */
  app.get("/api/todos", async (req: Request, res: Response) => {
    const ctx = buildRequestContext(req, "/todos");
    const http = createHttpClient({ requestId: ctx.requestId });

    // Set cache headers
    applyCachePolicy(req, res, "data");

    try {
      const todos = await getTodos(http);

      // Map to our internal format (removes any extra fields from external API)
      res.status(200).json(
        todos.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
        }))
      );
    } catch (error) {
      // Log error with request context for debugging
      console.error(
        `[todos] FAIL requestId=${ctx.requestId} userId=${ctx.userId}`,
        error
      );

      // Return error response (don't expose internal details)
      res.status(500).json({
        code: "TODOS_FAILED",
        message: "Failed to load todos. Please try again.",
      });
    }
  });
}

// ============================================================================
// UTILITY ROUTES
// ============================================================================

/**
 * Registers utility endpoints (health checks, test endpoints).
 */
function registerUtilityRoutes(app: Express): void {
  /**
   * GET /api/hello
   *
   * Simple test endpoint to verify the server is working.
   * Useful for debugging and smoke tests.
   */
  app.get("/api/hello", (_req: Request, res: Response) => {
    res.status(200).json({
      message: "Hello from the Node/Express BFF!",
    });
  });

  /**
   * GET /api/injected
   *
   * Test endpoint that returns a message about Redux state injection.
   * Used to verify SSR state injection is working.
   */
  app.get("/api/injected", (_req: Request, res: Response) => {
    res.status(200).json({
      message: "Hello from injected Redux state (BFF)",
    });
  });

  /**
   * GET /health
   *
   * Health check endpoint for load balancers and monitoring.
   *
   * Returns:
   * - status: "ok" if server is healthy
   * - uptimeSeconds: How long the server has been running
   * - timestamp: Current server time (useful for clock skew detection)
   *
   * Usage:
   * - Kubernetes liveness/readiness probes
   * - Load balancer health checks
   * - Monitoring systems
   */
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });
}
