/**
 * @fileoverview Server-side HTTP client with request tracing
 *
 * WHY A CUSTOM HTTP CLIENT?
 * While we have shared HTTP utilities in @restart/shared, the server needs
 * additional features:
 *
 * 1. REQUEST TRACING - Every request gets a unique ID that's passed through
 *    all downstream calls. This enables end-to-end debugging:
 *    "Request abc123 failed at external API call to /users"
 *
 * 2. DETAILED LOGGING - Server logs are crucial for debugging production issues.
 *    We log every external call with timing information.
 *
 * 3. CUSTOM HEADERS - Server may need to add authentication, API keys, etc.
 *
 * RELATIONSHIP TO SHARED UTILITIES:
 * This file uses the same patterns as @restart/shared (timeout, retry, etc.)
 * but adds server-specific concerns. In a larger project, you might:
 * - Use the shared utilities and wrap them with tracing
 * - Or keep separate implementations for different environments
 *
 * We keep a separate implementation here for clarity and to demonstrate
 * how server requirements can differ from client requirements.
 */

import { sleep } from "@restart/shared";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Interface for the HTTP client.
 *
 * Currently only supports GET requests returning JSON.
 * Add more methods as needed (post, put, delete, etc.)
 */
export type HttpClient = {
  /**
   * Makes a GET request and returns parsed JSON.
   *
   * @param url - The URL to fetch
   * @param opts - Optional configuration
   * @returns Parsed JSON response
   * @throws Error if request fails after retries
   */
  getJson<T>(
    url: string,
    opts?: { timeoutMs?: number; retries?: number }
  ): Promise<T>;
};

/**
 * Configuration for creating an HTTP client.
 */
export type HttpClientConfig = {
  /** Unique identifier for request tracing */
  requestId: string;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Logs an HTTP request with timing information.
 *
 * @param requestId - The request trace ID
 * @param method - HTTP method (GET, POST, etc.)
 * @param url - The URL that was called
 * @param durationMs - How long the request took
 * @param status - HTTP status code (optional, for errors)
 */
function logRequest(
  requestId: string,
  method: string,
  url: string,
  durationMs: number,
  status?: number
): void {
  const statusStr = status ? ` ${status}` : "";
  console.log(
    `[${requestId}] ${method} ${url}${statusStr} (${durationMs.toFixed(2)}ms)`
  );
}

/**
 * Determines if an error is retryable.
 *
 * We only retry on:
 * - AbortError: Request was cancelled (usually timeout)
 * - TypeError: Network-level failure
 *
 * We do NOT retry on HTTP errors (4xx, 5xx) as those are valid responses.
 *
 * @param error - The error that occurred
 * @returns true if we should retry
 */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const isAbort = error.name === "AbortError";
  const isNetwork = error instanceof TypeError;

  return isAbort || isNetwork;
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

/**
 * Creates an HTTP client with request tracing.
 *
 * Each client instance is bound to a specific request ID, which is passed
 * to all downstream calls for end-to-end tracing.
 *
 * WHY A FACTORY FUNCTION?
 * - Each incoming request gets its own client with unique ID
 * - Enables parallel requests without ID collision
 * - Makes testing easier (can mock the factory)
 *
 * @param config - Configuration including request ID
 * @returns HTTP client instance
 *
 * @example
 * // In your route handler:
 * app.get('/api/data', async (req, res) => {
 *   const http = createHttpClient({ requestId: req.id });
 *   const data = await http.getJson('https://api.example.com/data');
 *   res.json(data);
 * });
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { requestId } = config;

  async function getJson<T>(
    url: string,
    opts?: { timeoutMs?: number; retries?: number }
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? 5000;
    const maxRetries = opts?.retries ?? 1;

    let lastError: unknown = null;

    // Attempt the request up to (1 + retries) times
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Set up timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Track timing
      const start = process.hrtime.bigint();

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            // Pass request ID to downstream services for tracing
            "X-Request-ID": requestId,
          },
        });

        // Calculate duration
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;

        // Log the request
        logRequest(requestId, "GET", url, durationMs, response.status);

        // Handle HTTP errors
        if (!response.ok) {
          // Try to get error details from response body
          const errorBody = await response.text().catch(() => "");
          throw new Error(
            `HTTP ${response.status} ${response.statusText}: ${errorBody}`
          );
        }

        // Parse and return JSON
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;

        // Log failures
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        console.error(
          `[${requestId}] GET ${url} FAILED (${durationMs.toFixed(2)}ms):`,
          error instanceof Error ? error.message : error
        );

        // Only retry on network-level failures
        if (!isRetryable(error) || attempt >= maxRetries) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        const backoffMs = 100 * (attempt + 1);
        console.log(`[${requestId}] Retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
      } finally {
        // Always clean up the timeout
        clearTimeout(timeoutId);
      }
    }

    // Should never reach here, but TypeScript needs a return
    throw lastError;
  }

  return { getJson };
}
