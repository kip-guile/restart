/**
 * @fileoverview Webpack manifest reader for asset discovery
 *
 * WHY WE NEED A MANIFEST:
 * When webpack builds the frontend, it creates files with content hashes
 * in their names like "app.3f2a91c0.js". These hashes change whenever
 * the code changes, which is great for cache busting.
 *
 * But the server needs to know the exact filename to include in the HTML:
 * <script src="/assets/app.3f2a91c0.js"></script>
 *
 * THE OLD WAY (scanning directory):
 * We used to scan the assets directory looking for files matching "app.*.js".
 * This is fragile because:
 * - What if there are multiple matching files?
 * - What if the naming pattern changes?
 * - What if we add more entry points?
 *
 * THE NEW WAY (reading manifest):
 * Webpack generates manifest.json with a simple mapping:
 * {
 *   "app.js": "/assets/app.3f2a91c0.js",
 *   "app.css": "/assets/app.abc123.css"
 * }
 *
 * Benefits:
 * - Reliable: One source of truth
 * - Fast: No directory scanning
 * - Flexible: Works with any number of entry points
 * - Standard: Common pattern in the ecosystem
 */

import fs from "fs/promises";
import path from "path";

// ============================================================================
// TYPES
// ============================================================================

/**
 * The structure of webpack's manifest.json file.
 * Keys are logical names (e.g., "app.js"), values are actual paths.
 */
export type AssetManifest = Record<string, string>;

/**
 * Resolved asset paths for use in HTML rendering.
 */
export type ResolvedAssets = {
  /** Path to the main JavaScript bundle */
  mainScript: string;
  /** Path to the main CSS file (optional, may not exist in dev) */
  mainStyle: string | null;
};

// ============================================================================
// MANIFEST READER
// ============================================================================

// Cache the manifest in memory to avoid reading from disk on every request
let cachedManifest: AssetManifest | null = null;
let cacheTimestamp: number = 0;

// In development, refresh cache every 5 seconds (allows hot reload)
// In production, cache indefinitely (manifest doesn't change)
const CACHE_TTL_MS =
  process.env.NODE_ENV === "production" ? Infinity : 5000;

/**
 * Reads and parses the webpack manifest file.
 *
 * The manifest file maps logical asset names to their actual paths:
 * { "app.js": "/assets/app.abc123.js" }
 *
 * CACHING:
 * - Production: Cached forever (manifest won't change)
 * - Development: Cached for 5 seconds (allows hot reload to work)
 *
 * @param staticDir - Path to the static assets directory
 * @returns Parsed manifest object
 * @throws Error if manifest file doesn't exist or is invalid JSON
 *
 * @example
 * const manifest = await readManifest('/app/static');
 * console.log(manifest['app.js']); // "/assets/app.abc123.js"
 */
export async function readManifest(staticDir: string): Promise<AssetManifest> {
  const now = Date.now();

  // Return cached manifest if still valid
  if (cachedManifest && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedManifest;
  }

  const manifestPath = path.join(staticDir, "manifest.json");

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    cachedManifest = JSON.parse(content) as AssetManifest;
    cacheTimestamp = now;
    return cachedManifest;
  } catch (error) {
    // Provide helpful error messages for common issues
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Manifest file not found at ${manifestPath}. ` +
          "Did you run 'npm run build' in the web app?"
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in manifest file at ${manifestPath}: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Resolves the main JavaScript and CSS asset paths from the manifest.
 *
 * This is the main function you'll use to get asset paths for HTML rendering.
 * It handles the common case of a single entry point named "app".
 *
 * @param staticDir - Path to the static assets directory
 * @returns Object with mainScript and mainStyle paths
 * @throws Error if manifest is missing or main script not found
 *
 * @example
 * const assets = await resolveAssets('/app/static');
 * // In your HTML template:
 * // <script src="${assets.mainScript}"></script>
 * // ${assets.mainStyle ? `<link href="${assets.mainStyle}">` : ''}
 */
export async function resolveAssets(staticDir: string): Promise<ResolvedAssets> {
  const manifest = await readManifest(staticDir);

  // Look for the main script (try common naming patterns)
  const mainScript = manifest["app.js"] || manifest["main.js"];

  if (!mainScript) {
    const availableKeys = Object.keys(manifest).join(", ");
    throw new Error(
      `Could not find main script in manifest. ` +
        `Available entries: ${availableKeys || "(none)"}`
    );
  }

  // CSS is optional (may not exist in development mode)
  const mainStyle = manifest["app.css"] || manifest["main.css"] || null;

  return { mainScript, mainStyle };
}

/**
 * Clears the cached manifest.
 *
 * Useful for testing or when you know the manifest has changed.
 * In normal operation, you shouldn't need to call this.
 */
export function clearManifestCache(): void {
  cachedManifest = null;
  cacheTimestamp = 0;
}
