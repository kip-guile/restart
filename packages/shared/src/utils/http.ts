/**
 * @fileoverview Shared HTTP utilities for making API requests
 *
 * WHY THIS EXISTS:
 * Both the server (BFF) and client (browser) need to make HTTP requests.
 * Instead of duplicating retry logic, timeout handling, and error handling
 * in both places, we centralize it here.
 *
 * KEY CONCEPTS:
 *
 * 1. TIMEOUTS - Requests that take too long should fail gracefully
 *    We use AbortController to cancel requests after a specified time.
 *    This prevents the app from hanging if a server is slow or unresponsive.
 *
 * 2. RETRIES - Network requests can fail temporarily
 *    If a request fails due to network issues (not HTTP errors like 404),
 *    we automatically retry with "exponential backoff" - waiting longer
 *    between each attempt (100ms, 200ms, 300ms, etc.)
 *
 * 3. ABORT CONTROLLER - Browser API for canceling requests
 *    When we set a timeout, we create an AbortController. If the timeout
 *    fires before the request completes, we call controller.abort() which
 *    cancels the in-flight request and throws an AbortError.
 *
 * EXAMPLE USAGE:
 * ```typescript
 * const result = await fetchWithRetry('/api/data', {
 *   timeoutMs: 5000,  // Cancel if takes longer than 5 seconds
 *   retries: 2,       // Retry up to 2 times on network failure
 * });
 * ```
 */

import { sleep } from "./sleep.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for configuring HTTP request behavior.
 *
 * @property timeoutMs - Maximum time to wait for response (default: 5000ms)
 * @property retries - Number of retry attempts on network failure (default: 1)
 * @property headers - Additional HTTP headers to include in the request
 */
export type FetchOptions = {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
};

/**
 * Result of a fetch operation - either success with data or failure with error info.
 *
 * WHY A RESULT TYPE?
 * Instead of throwing errors that need try/catch everywhere, we return a
 * discriminated union. This makes error handling explicit and type-safe:
 *
 * ```typescript
 * const result = await fetchJson('/api/data');
 * if (!result.ok) {
 *   console.log(result.error); // TypeScript knows this exists
 *   return;
 * }
 * console.log(result.data); // TypeScript knows this is the data type
 * ```
 */
export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determines if an error is something we should retry.
 *
 * We only retry on:
 * - AbortError: Request was cancelled (usually due to timeout)
 * - TypeError: Network-level failures (DNS, connection refused, etc.)
 *
 * We do NOT retry on:
 * - HTTP errors (404, 500, etc.) - these are valid responses from the server
 * - Parse errors - the response was invalid JSON
 *
 * @param error - The error that was thrown
 * @returns true if we should retry the request
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // AbortError = request was cancelled (timeout)
  const isAbort = error.name === "AbortError";

  // TypeError = network-level failure (couldn't connect at all)
  const isNetwork = error instanceof TypeError;

  return isAbort || isNetwork;
}

/**
 * Creates an AbortController with an automatic timeout.
 *
 * HOW IT WORKS:
 * 1. Creates an AbortController (provides a way to cancel the request)
 * 2. Sets a timer that will abort after timeoutMs
 * 3. Returns both the controller (for the request) and a cleanup function
 *
 * IMPORTANT: Always call cleanup() when done to prevent memory leaks!
 *
 * @param timeoutMs - Time in milliseconds before aborting
 * @returns Object with controller and cleanup function
 *
 * @example
 * const { controller, cleanup } = createTimeoutController(5000);
 * try {
 *   const response = await fetch(url, { signal: controller.signal });
 *   // ... handle response
 * } finally {
 *   cleanup(); // Always clean up the timer!
 * }
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Fetches JSON data from a URL with automatic timeout and retry support.
 *
 * This is the main function you'll use for API calls. It handles:
 * - Setting appropriate headers (Accept: application/json)
 * - Timing out slow requests
 * - Retrying on network failures with exponential backoff
 * - Parsing JSON responses
 * - Returning a type-safe result
 *
 * @param url - The URL to fetch from
 * @param options - Configuration for timeout, retries, and headers
 * @returns A FetchResult with either the data or error information
 *
 * @example
 * // Simple usage
 * const result = await fetchJson<User>('/api/user/123');
 * if (result.ok) {
 *   console.log(result.data.name);
 * } else {
 *   console.error(result.error);
 * }
 *
 * @example
 * // With options
 * const result = await fetchJson<Todo[]>('/api/todos', {
 *   timeoutMs: 3000,
 *   retries: 2,
 *   headers: { 'X-Request-ID': 'abc123' }
 * });
 */
export async function fetchJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const { timeoutMs = 5000, retries = 1, headers = {} } = options;

  let lastError: string = "Unknown error";
  let lastStatus: number | undefined;

  // Attempt the request up to (1 + retries) times
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Set up timeout
    const { controller, cleanup } = createTimeoutController(timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...headers,
        },
      });

      // Check if server returned an error status
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        lastStatus = response.status;

        // Don't retry HTTP errors - the server responded, just with an error
        return { ok: false, error: lastError, status: lastStatus };
      }

      // Parse JSON response
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (error) {
      // Store error info for potential return
      lastError =
        error instanceof Error ? error.message : "Request failed";

      // Only retry on network-level failures
      if (!isRetryableError(error) || attempt >= retries) {
        return { ok: false, error: lastError };
      }

      // Wait before retrying (exponential backoff: 100ms, 200ms, 300ms, ...)
      await sleep(100 * (attempt + 1));
    } finally {
      // Always clean up the timeout to prevent memory leaks
      cleanup();
    }
  }

  // Should never reach here, but TypeScript needs a return
  // Only include status if it's defined (exactOptionalPropertyTypes compliance)
  if (lastStatus !== undefined) {
    return { ok: false, error: lastError, status: lastStatus };
  }
  return { ok: false, error: lastError };
}

/**
 * Fetches JSON and throws on error (for when you want try/catch style).
 *
 * Use this when you prefer traditional error handling with try/catch,
 * or when you're in a context where errors should propagate up.
 *
 * @param url - The URL to fetch from
 * @param options - Configuration for timeout, retries, and headers
 * @returns The parsed JSON data
 * @throws Error if the request fails for any reason
 *
 * @example
 * try {
 *   const user = await fetchJsonOrThrow<User>('/api/user/123');
 *   console.log(user.name);
 * } catch (error) {
 *   console.error('Failed to load user:', error.message);
 * }
 */
export async function fetchJsonOrThrow<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const result = await fetchJson<T>(url, options);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}
