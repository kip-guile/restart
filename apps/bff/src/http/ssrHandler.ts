/**
 * @fileoverview Server-Side Rendering (SSR) request handler
 *
 * WHAT IS SSR?
 * Server-Side Rendering means generating HTML on the server instead of
 * the browser. When a user requests a page:
 *
 * WITHOUT SSR (Client-Side Rendering):
 * 1. Server sends empty HTML with <script> tag
 * 2. Browser downloads JavaScript
 * 3. JavaScript fetches data
 * 4. JavaScript renders the page
 * User sees: Loading... -> Content (slow, bad for SEO)
 *
 * WITH SSR:
 * 1. Server fetches data
 * 2. Server renders React to HTML string
 * 3. Server sends complete HTML
 * 4. Browser shows content immediately
 * 5. JavaScript "hydrates" (makes interactive)
 * User sees: Content immediately (fast, good for SEO)
 *
 * HYDRATION:
 * After the browser receives SSR HTML, React needs to "hydrate" it:
 * - Attach event listeners
 * - Set up state management
 * - Make the page interactive
 *
 * For hydration to work, client must render the EXACT same HTML as server.
 * That's why we inject bootstrap data - so client has the same data as server.
 */

import type { Express, Request, Response, NextFunction } from "express";
import path from "path";
import { buildRequestContext } from "../server/requestContext.js";
import { getBootstrapPayload } from "../server/bootstrap.js";
import { renderHtml } from "../server/ssr/render.js";
import { resolveAssets } from "../server/manifest.js";
import { applyCachePolicy } from "./cachePolicy.js";

// ============================================================================
// SSR HANDLER
// ============================================================================

/**
 * Creates the SSR handler for rendering React pages on the server.
 *
 * This handler:
 * 1. Catches all GET requests that aren't API calls or static files
 * 2. Generates bootstrap data for the requested route
 * 3. Renders React to HTML
 * 4. Sends the complete HTML to the client
 *
 * @param staticDir - Path to the static assets directory
 * @returns Express middleware function
 *
 * @example
 * const staticDir = path.join(__dirname, 'static');
 * app.get('/*', createSsrHandler(staticDir));
 */
export function createSsrHandler(staticDir: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Skip API routes - they have their own handlers
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    // Skip requests for files (have extensions like .js, .css, .png)
    // Let static middleware or 404 handler deal with these
    if (path.extname(req.path)) {
      next();
      return;
    }

    const route = req.path;
    console.log(`[SSR] Rendering route: ${route}`);

    try {
      // Build request context with user info, request ID, etc.
      const ctx = buildRequestContext(req, route);

      // Generate bootstrap data (fetches external data, handles caching)
      const bootstrap = await getBootstrapPayload(ctx);

      // Get asset paths from webpack manifest
      const assets = await resolveAssets(staticDir);

      // Set cache headers based on authentication
      applyCachePolicy(req, res, "html");

      // Render React to HTML string
      const html = await renderHtml({
        ctx,
        bootstrap,
        assetScriptSrc: assets.mainScript,
      });

      // Send the HTML response
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Vary", "Accept-Encoding");
      res.status(200).send(html);
    } catch (error) {
      // Log error and pass to Express error handler
      console.error(`[SSR] Error rendering ${route}:`, error);
      next(error);
    }
  };
}

/**
 * Creates a 404 handler for unmatched requests.
 *
 * This runs after all other routes. If nothing else handled the request,
 * we send a 404 page.
 *
 * @param staticDir - Path to the static assets directory
 * @returns Express middleware function
 */
export function create404Handler(staticDir: string) {
  return (_req: Request, res: Response): void => {
    res.status(404).sendFile(path.join(staticDir, "404.html"));
  };
}
