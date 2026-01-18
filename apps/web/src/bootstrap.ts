/**
 * @fileoverview Client-side bootstrap utilities for SSR hydration
 *
 * WHAT IS HYDRATION?
 * When the server sends pre-rendered HTML, React needs to "hydrate" it:
 * 1. Server renders HTML with data
 * 2. Browser displays HTML immediately (fast!)
 * 3. JavaScript loads and React "hydrates" the HTML
 * 4. React attaches event listeners and state
 * 5. Page becomes interactive
 *
 * For hydration to work correctly, the client must render the EXACT same
 * content as the server. That's why we inject server data into the page.
 *
 * INJECTED DATA:
 * The server injects two pieces of data into window globals:
 *
 * 1. window.__BOOTSTRAP__ - The bootstrap payload (route, greeting, page data)
 *    Used for initial page data before Redux is initialized
 *
 * 2. window.__PRELOADED_STATE__ - The complete Redux store state
 *    Used to initialize the Redux store with server data
 *
 * WHY TWO SEPARATE GLOBALS?
 * - __BOOTSTRAP__ is the raw page data (easier to work with directly)
 * - __PRELOADED_STATE__ is the full Redux state (includes all slices)
 * Having both gives flexibility in how we initialize the app.
 */

import type { BootstrapPayload } from "@restart/shared";
import {
  isValidBootstrapPayload,
  isValidPreloadedState,
  makeErrorBootstrap,
  fetchJson,
  BOOTSTRAP_ERROR_CODES,
  BOOTSTRAP_ERROR_MESSAGES,
} from "@restart/shared";
import type { RootState } from "@restart/ui";

// ============================================================================
// GLOBAL TYPE DECLARATIONS
// ============================================================================

/**
 * Extends the Window interface to include our injected globals.
 *
 * TypeScript doesn't know about custom window properties by default.
 * This declaration tells TypeScript they exist.
 */
declare global {
  interface Window {
    /** Bootstrap payload injected by SSR */
    __BOOTSTRAP__?: unknown;
    /** Complete Redux state injected by SSR */
    __PRELOADED_STATE__?: unknown;
  }
}

// ============================================================================
// WINDOW STATE READERS
// ============================================================================

/**
 * Reads and validates the bootstrap payload from window global.
 *
 * The server injects bootstrap data as: window.__BOOTSTRAP__ = {...}
 * This function reads it, validates it, and cleans up the global.
 *
 * WHY DELETE AFTER READING?
 * - Security: Don't leave data in easily-accessible globals
 * - Memory: Free up the memory used by the data
 * - Single use: Bootstrap should only be read once
 *
 * @returns The bootstrap payload if valid, null otherwise
 *
 * @example
 * const bootstrap = readBootstrapFromWindow();
 * if (bootstrap) {
 *   console.log(`Route: ${bootstrap.route}`);
 * }
 */
export function readBootstrapFromWindow(): BootstrapPayload | null {
  const raw = window.__BOOTSTRAP__;

  // No bootstrap data injected (client-only navigation)
  if (!raw) {
    return null;
  }

  // Clean up the global immediately
  delete window.__BOOTSTRAP__;

  // Validate the data shape
  if (!isValidBootstrapPayload(raw)) {
    console.warn("[bootstrap] Invalid bootstrap payload shape in window");
    return null;
  }

  return raw;
}

/**
 * Reads and validates the preloaded Redux state from window global.
 *
 * The server injects Redux state as: window.__PRELOADED_STATE__ = {...}
 * This contains the complete store state for hydration.
 *
 * @returns Partial Redux state if valid, null otherwise
 *
 * @example
 * const preloadedState = readPreloadedStateFromWindow();
 * const store = makeStore({ preloadedState });
 */
export function readPreloadedStateFromWindow(): Partial<RootState> | null {
  const raw = window.__PRELOADED_STATE__;

  // No preloaded state (client-only rendering)
  if (!raw) {
    return null;
  }

  // Clean up the global immediately
  delete window.__PRELOADED_STATE__;

  // Validate the data shape
  if (!isValidPreloadedState(raw)) {
    console.warn("[bootstrap] Invalid preloaded state shape in window");
    return null;
  }

  return raw as Partial<RootState>;
}

// ============================================================================
// API FETCHING
// ============================================================================

/**
 * Fetches bootstrap data from the API for a given route.
 *
 * This is used when:
 * - Client-side navigation (no SSR data available)
 * - SSR data was invalid or missing
 * - Refreshing page data
 *
 * @param route - The route to fetch bootstrap data for (e.g., "/todos")
 * @returns Bootstrap payload (or error payload if fetch fails)
 *
 * @example
 * // User navigates from / to /todos client-side
 * const bootstrap = await fetchBootstrap("/todos");
 */
export async function fetchBootstrap(
  route: string
): Promise<BootstrapPayload> {
  const url = `/api/bootstrap?path=${encodeURIComponent(route)}`;

  const result = await fetchJson<BootstrapPayload>(url, {
    timeoutMs: 5000,
    retries: 1,
  });

  if (!result.ok) {
    // Determine error type based on status
    const isUpstream = result.status && result.status >= 400;

    return makeErrorBootstrap(route, {
      status: result.status ?? 0,
      code: isUpstream
        ? BOOTSTRAP_ERROR_CODES.UPSTREAM
        : BOOTSTRAP_ERROR_CODES.UNKNOWN,
      message: isUpstream
        ? BOOTSTRAP_ERROR_MESSAGES.UPSTREAM
        : BOOTSTRAP_ERROR_MESSAGES.NETWORK,
    });
  }

  return result.data;
}

/**
 * Gets bootstrap data, trying window global first, then API.
 *
 * This is the main function to use when initializing the app:
 * 1. Check if server injected bootstrap data (SSR)
 * 2. If not, fetch from API (client-side navigation)
 *
 * @param route - The current route (usually window.location.pathname)
 * @returns Bootstrap payload for the route
 *
 * @example
 * async function initApp() {
 *   const bootstrap = await getBootstrap(window.location.pathname);
 *   applyBootstrapToStore(bootstrap, store.dispatch);
 * }
 */
export async function getBootstrap(route: string): Promise<BootstrapPayload> {
  // Try to read SSR-injected data first
  const injected = readBootstrapFromWindow();
  if (injected) {
    console.log("[bootstrap] Using SSR-injected bootstrap data");
    return injected;
  }

  // No SSR data, fetch from API
  console.log("[bootstrap] Fetching bootstrap data from API");
  return fetchBootstrap(route);
}
