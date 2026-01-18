/**
 * @fileoverview Bootstrap payload generation for SSR
 *
 * WHAT IS BOOTSTRAP?
 * When a user visits a page, we need to send them initial data so the page
 * renders with content (not a loading spinner). This initial data is called
 * the "bootstrap payload".
 *
 * THE FLOW:
 * 1. User requests /todos
 * 2. Server fetches todo data from external API
 * 3. Server creates bootstrap payload with todos
 * 4. Server renders React with this data
 * 5. Server sends HTML + bootstrap data to browser
 * 6. Browser hydrates React with the same data
 *
 * CACHING:
 * To avoid fetching data on every request, we cache bootstrap payloads:
 * - Public cache: For anonymous users (shared across all anon visitors)
 * - Private cache: For authenticated users (per-user)
 *
 * WHY TWO CACHES?
 * Anonymous users all see the same data (generic greeting).
 * Authenticated users see personalized data (their name in greeting).
 * Mixing them would leak personal data or show wrong greetings.
 */

import type { BootstrapPayload } from "@restart/shared";
import {
  makeErrorBootstrap,
  makeHomeBootstrap,
  makeTodosBootstrap,
  BOOTSTRAP_ERROR_CODES,
} from "@restart/shared";

import type { RequestContext } from "./requestContext.js";
import { createHttpClient } from "./httpClient.js";
import { TTLCache } from "./cache.js";
import { getUserName, getTodos, toInternalTodo } from "./external/index.js";

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/**
 * Cache for anonymous user bootstrap payloads.
 *
 * WHY 15 SECONDS?
 * Short enough that data stays fresh, long enough to handle traffic spikes.
 * In production, you'd tune this based on your data freshness requirements.
 */
const publicBootstrapCache = new TTLCache<BootstrapPayload>(15_000);

/**
 * Cache for authenticated user bootstrap payloads.
 *
 * Each authenticated user gets their own cached payload (keyed by userId).
 * This prevents re-fetching their name on every page load.
 */
const privateBootstrapCache = new TTLCache<BootstrapPayload>(15_000);

// ============================================================================
// CACHE KEY HELPERS
// ============================================================================

/**
 * Generates cache key for public (anonymous) bootstrap payloads.
 *
 * Public payloads only vary by route since all anonymous users see the same data.
 *
 * @param ctx - Request context
 * @returns Cache key string
 */
function makePublicKey(ctx: RequestContext): string {
  return `route=${ctx.route}`;
}

/**
 * Generates cache key for private (authenticated) bootstrap payloads.
 *
 * Private payloads vary by userId AND route to ensure users get their own data.
 *
 * @param ctx - Request context
 * @returns Cache key string
 */
function makePrivateKey(ctx: RequestContext): string {
  if (!ctx.isAuthenticated || !ctx.userId) {
    return `anon:${ctx.route}`;
  }
  return `user=${ctx.userId}:${ctx.route}`;
}

/**
 * Determines if a bootstrap payload can be publicly cached.
 *
 * Currently, all bootstraps are private because we personalize the greeting.
 * If you removed personalization, anonymous bootstraps could be public.
 *
 * @param ctx - Request context
 * @returns true if payload can be shared across users
 */
function isBootstrapPublic(_ctx: RequestContext): boolean {
  // With personalized greeting, bootstrap is always private
  // Change this to true if you want to share anonymous bootstraps
  return false;
}

// ============================================================================
// GREETING HELPER
// ============================================================================

/**
 * Generates a greeting message based on authentication status.
 *
 * Authenticated users get a personalized greeting with their name.
 * Anonymous users get a generic greeting.
 *
 * @param ctx - Request context
 * @param http - HTTP client for fetching user data
 * @returns Greeting string
 */
async function generateGreeting(
  ctx: RequestContext,
  http: ReturnType<typeof createHttpClient>
): Promise<string> {
  if (!ctx.isAuthenticated) {
    return "Welcome";
  }

  try {
    const userName = await getUserName(http);
    return `Welcome back, ${userName}`;
  } catch (error) {
    // If we can't fetch the name, fall back to generic greeting
    console.warn(
      `[bootstrap] Failed to fetch user name for greeting: ${error}`
    );
    return "Welcome back";
  }
}

// ============================================================================
// ROUTE-SPECIFIC PAYLOAD BUILDERS
// ============================================================================

/**
 * Builds bootstrap payload for the todos page.
 *
 * Fetches todos from external API and packages them in the payload.
 *
 * @param ctx - Request context
 * @param http - HTTP client
 * @param greeting - Pre-generated greeting message
 * @returns Bootstrap payload for todos page
 */
async function buildTodosPayload(
  ctx: RequestContext,
  http: ReturnType<typeof createHttpClient>,
  greeting: string
): Promise<BootstrapPayload> {
  const externalTodos = await getTodos(http);
  const todos = externalTodos.map(toInternalTodo);

  return makeTodosBootstrap(ctx.route, greeting, todos);
}

/**
 * Builds bootstrap payload for any non-todos page.
 *
 * For simplicity, all other pages get the "home" type payload.
 * In a real app, you'd have builders for each page type.
 *
 * @param ctx - Request context
 * @param greeting - Pre-generated greeting message
 * @returns Bootstrap payload for home/default pages
 */
function buildDefaultPayload(
  ctx: RequestContext,
  greeting: string
): BootstrapPayload {
  return makeHomeBootstrap(ctx.route, greeting);
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Generates a bootstrap payload for the given request context.
 *
 * This is the main function called by the SSR handler. It:
 * 1. Checks cache for existing payload
 * 2. If not cached, generates new payload
 * 3. Caches the result for future requests
 * 4. Returns the payload (or error payload if something fails)
 *
 * @param ctx - Request context with route, user info, etc.
 * @returns Bootstrap payload ready for SSR
 *
 * @example
 * const ctx = buildRequestContext(req);
 * const payload = await getBootstrapPayload(ctx);
 * const html = await renderHtml({ ctx, bootstrap: payload });
 */
export async function getBootstrapPayload(
  ctx: RequestContext
): Promise<BootstrapPayload> {
  // Determine which cache to use based on whether content is personalized
  const isPublic = isBootstrapPublic(ctx);
  const cache = isPublic ? publicBootstrapCache : privateBootstrapCache;
  const cacheKey = isPublic ? makePublicKey(ctx) : makePrivateKey(ctx);

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[bootstrap] cache HIT ${cacheKey}`);
    return cached;
  }

  console.log(`[bootstrap] cache MISS ${cacheKey}`);

  // Create HTTP client with request ID for tracing
  const http = createHttpClient({ requestId: ctx.requestId });

  try {
    // Generate greeting (personalized for authenticated users)
    const greeting = await generateGreeting(ctx, http);

    // Build route-specific payload
    let payload: BootstrapPayload;

    if (ctx.route === "/todos") {
      payload = await buildTodosPayload(ctx, http, greeting);
    } else {
      payload = buildDefaultPayload(ctx, greeting);
    }

    // Cache the successful result
    cache.set(cacheKey, payload);

    return payload;
  } catch (error) {
    // Log the error with context for debugging
    console.error(
      `[bootstrap] FAIL requestId=${ctx.requestId} ` +
        `userId=${ctx.userId} route=${ctx.route}`,
      error
    );

    // Return an error payload instead of throwing
    // This ensures the page still renders (with an error message)
    return makeErrorBootstrap(ctx.route, {
      status: 500,
      code: BOOTSTRAP_ERROR_CODES.UNKNOWN,
      message: "An unexpected error occurred. Please try again.",
      greeting: "Welcome",
    });
  }
}

// Re-export getTodos for use in the API routes
export { getTodos } from "./external/index.js";
