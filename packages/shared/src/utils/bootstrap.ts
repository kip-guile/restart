/**
 * @fileoverview Bootstrap payload utilities for SSR hydration
 *
 * WHY THIS EXISTS:
 * When a user visits the app, the server pre-renders the HTML with data.
 * This "bootstrap" data needs to be:
 * 1. Generated on the server
 * 2. Injected into the HTML
 * 3. Read by the client to "hydrate" (make interactive) the page
 *
 * Both server and client need to work with the same data structure.
 * This file provides utilities that both sides can use, ensuring consistency.
 *
 * KEY CONCEPTS:
 *
 * 1. BOOTSTRAP PAYLOAD - Initial data sent from server to client
 *    Contains route info, greeting message, and page-specific data.
 *    Structure varies by page type (home, todos, error).
 *
 * 2. ERROR CODES - Standardized error identifiers
 *    - BOOTSTRAP_TIMEOUT: Server took too long to respond
 *    - BOOTSTRAP_UPSTREAM: Server responded with an error (4xx/5xx)
 *    - BOOTSTRAP_UNKNOWN: Something unexpected went wrong
 *
 * 3. VALIDATION - Checking data shape at runtime
 *    TypeScript only checks types at compile time. When reading data from
 *    window globals or JSON, we need runtime checks to ensure it's valid.
 */

import type { BootstrapPayload } from "../types/bootstrap.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Error codes used when bootstrap fails.
 *
 * Using constants instead of magic strings prevents typos and enables
 * autocomplete in your IDE. If you need to change a code, you only
 * change it in one place.
 */
export const BOOTSTRAP_ERROR_CODES = {
  /** Server request timed out before completing */
  TIMEOUT: "BOOTSTRAP_TIMEOUT",
  /** Server responded with HTTP error (4xx or 5xx status) */
  UPSTREAM: "BOOTSTRAP_UPSTREAM",
  /** Unexpected error (network failure, parse error, etc.) */
  UNKNOWN: "BOOTSTRAP_UNKNOWN",
} as const;

/**
 * Default user-facing error messages.
 *
 * These are shown to users when something goes wrong. They should be:
 * - Friendly and non-technical
 * - Actionable (tell user what to do)
 * - Not expose internal details
 */
export const BOOTSTRAP_ERROR_MESSAGES = {
  TIMEOUT: "The server is taking too long to respond. Please try again.",
  UPSTREAM: "We could not load the page data. Please retry.",
  UNKNOWN: "An unexpected error occurred. Please refresh the page.",
  NETWORK: "Network error while loading. Please check your connection.",
} as const;

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates a standardized error bootstrap payload.
 *
 * WHY USE A FACTORY FUNCTION?
 * Instead of manually constructing error objects everywhere (which leads to
 * inconsistencies and typos), we use this factory. Benefits:
 * - Consistent structure across server and client
 * - Default values for common cases
 * - Single place to update if structure changes
 *
 * @param route - The route that failed to load (e.g., "/todos")
 * @param options - Error details
 * @returns A complete BootstrapPayload with error information
 *
 * @example
 * // Server timeout
 * const payload = makeErrorBootstrap("/todos", {
 *   status: 504,
 *   code: "BOOTSTRAP_TIMEOUT",
 *   message: "Request timed out"
 * });
 *
 * @example
 * // Using defaults for unknown errors
 * const payload = makeErrorBootstrap("/about");
 * // Results in status: 0, code: "BOOTSTRAP_UNKNOWN"
 */
export function makeErrorBootstrap(
  route: string,
  options: {
    status?: number;
    code?: "BOOTSTRAP_TIMEOUT" | "BOOTSTRAP_UPSTREAM" | "BOOTSTRAP_UNKNOWN";
    message?: string;
    greeting?: string;
  } = {}
): BootstrapPayload {
  const {
    status = 0,
    code = BOOTSTRAP_ERROR_CODES.UNKNOWN,
    message = BOOTSTRAP_ERROR_MESSAGES.UNKNOWN,
    greeting = "Welcome",
  } = options;

  return {
    route,
    greeting,
    page: {
      kind: "error",
      status,
      code,
      message,
    },
  };
}

/**
 * Creates a home page bootstrap payload.
 *
 * @param route - The route (usually "/" for home)
 * @param greeting - Personalized greeting message
 * @returns A BootstrapPayload for the home page
 *
 * @example
 * const payload = makeHomeBootstrap("/", "Welcome back, John!");
 */
export function makeHomeBootstrap(
  route: string,
  greeting: string
): BootstrapPayload {
  return {
    route,
    greeting,
    page: { kind: "home" },
  };
}

/**
 * Creates a todos page bootstrap payload.
 *
 * @param route - The route (usually "/todos")
 * @param greeting - Personalized greeting message
 * @param todos - Array of todo items
 * @returns A BootstrapPayload for the todos page
 *
 * @example
 * const payload = makeTodosBootstrap("/todos", "Welcome!", [
 *   { id: 1, title: "Learn TypeScript", completed: false }
 * ]);
 */
export function makeTodosBootstrap(
  route: string,
  greeting: string,
  todos: Array<{ id: number; title: string; completed: boolean }>
): BootstrapPayload {
  return {
    route,
    greeting,
    page: {
      kind: "todos",
      todos,
    },
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates that a value looks like a BootstrapPayload.
 *
 * WHY RUNTIME VALIDATION?
 * TypeScript's type system only works at compile time. When we read data
 * from external sources (window globals, JSON files, APIs), we can't be
 * sure it has the right shape. This function checks at runtime.
 *
 * HOW IT WORKS:
 * 1. Check if value is a non-null object
 * 2. Check for required properties (route, page)
 * 3. Check that page has a valid kind
 *
 * Note: This is a "shallow" validation - it doesn't deeply check nested
 * structures. For production, consider using a library like Zod.
 *
 * @param value - Any value to check
 * @returns true if value appears to be a valid BootstrapPayload
 *
 * @example
 * const data = JSON.parse(jsonString);
 * if (isValidBootstrapPayload(data)) {
 *   // TypeScript now knows data is BootstrapPayload
 *   console.log(data.route);
 * }
 */
export function isValidBootstrapPayload(
  value: unknown
): value is BootstrapPayload {
  // Must be a non-null object
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Must have route (string) and page (object)
  if (typeof obj.route !== "string") {
    return false;
  }

  if (typeof obj.page !== "object" || obj.page === null) {
    return false;
  }

  const page = obj.page as Record<string, unknown>;

  // page.kind must be one of our known types
  const validKinds = ["home", "todos", "error"];
  if (!validKinds.includes(page.kind as string)) {
    return false;
  }

  return true;
}

/**
 * Validates that a value looks like preloaded Redux state.
 *
 * WHY THIS EXISTS:
 * During SSR, we inject the Redux store state into the HTML. The client
 * reads this to "hydrate" the store without re-fetching data. We need
 * to validate the state before using it.
 *
 * @param value - Any value to check
 * @returns true if value appears to be valid Redux state
 *
 * @example
 * const state = window.__PRELOADED_STATE__;
 * if (isValidPreloadedState(state)) {
 *   const store = createStore(rootReducer, state);
 * }
 */
export function isValidPreloadedState(
  value: unknown
): value is { app: unknown; api?: unknown } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  // Must have 'app' slice at minimum (our main application state)
  return "app" in value;
}
