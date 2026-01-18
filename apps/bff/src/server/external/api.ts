/**
 * @fileoverview Functions for fetching data from external APIs
 *
 * WHY SEPARATE DATA FETCHING?
 * By isolating external API calls in one place, we:
 *
 * 1. CENTRALIZE configuration (URLs, timeouts, retries)
 * 2. SIMPLIFY mocking for tests
 * 3. HANDLE errors consistently
 * 4. TRANSFORM responses to internal types
 *
 * ARCHITECTURE PATTERN: Repository Pattern
 * These functions act as a "repository" for external data. The rest of the
 * app doesn't need to know about URLs or HTTP details - it just calls
 * getUserName() or getTodos().
 */

import type { HttpClient } from "../httpClient.js";
import type { ExternalUser, ExternalTodo } from "./types.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * External API configuration.
 *
 * In a real app, these might come from environment variables.
 * For this learning project, we use JSONPlaceholder, a free fake API.
 */
const API_CONFIG = {
  /** Base URL for JSONPlaceholder API */
  baseUrl: "https://jsonplaceholder.typicode.com",

  /** Default timeout for API requests in milliseconds */
  timeoutMs: 1500,

  /** Number of retry attempts for failed requests */
  retries: 1,
} as const;

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetches a user's name from the external API.
 *
 * WHY JUST THE NAME?
 * We only need the user's name for the greeting. By returning just what
 * we need (not the whole user object), we:
 * - Keep the interface simple
 * - Make it clear what data flows through the system
 * - Avoid temptation to use fields we shouldn't
 *
 * @param http - HTTP client instance (with request ID for tracing)
 * @param userId - ID of the user to fetch (defaults to 1 for demo)
 * @returns The user's display name
 * @throws Error if the request fails after retries
 *
 * @example
 * const http = createHttpClient({ requestId: 'abc123' });
 * const name = await getUserName(http);
 * console.log(`Hello, ${name}!`); // "Hello, Leanne Graham!"
 */
export async function getUserName(
  http: HttpClient,
  userId: number = 1
): Promise<string> {
  const user = await http.getJson<ExternalUser>(
    `${API_CONFIG.baseUrl}/users/${userId}`,
    {
      timeoutMs: API_CONFIG.timeoutMs,
      retries: API_CONFIG.retries,
    }
  );

  return user.name;
}

/**
 * Fetches a list of todos from the external API.
 *
 * WHY LIMIT TO 5?
 * JSONPlaceholder has 200 todos. We limit to 5 for:
 * - Faster page loads
 * - Simpler UI
 * - Demonstration purposes
 *
 * In a real app, you'd implement pagination.
 *
 * @param http - HTTP client instance (with request ID for tracing)
 * @param limit - Maximum number of todos to fetch (default: 5)
 * @returns Array of todo items
 * @throws Error if the request fails after retries
 *
 * @example
 * const http = createHttpClient({ requestId: 'abc123' });
 * const todos = await getTodos(http);
 * todos.forEach(todo => console.log(todo.title));
 */
export async function getTodos(
  http: HttpClient,
  limit: number = 5
): Promise<ExternalTodo[]> {
  return http.getJson<ExternalTodo[]>(
    `${API_CONFIG.baseUrl}/todos?_limit=${limit}`,
    {
      timeoutMs: API_CONFIG.timeoutMs,
      retries: API_CONFIG.retries,
    }
  );
}

/**
 * Transforms external todo format to internal format.
 *
 * WHY TRANSFORM?
 * Even though the shapes are identical now, having this function:
 * 1. Documents the transformation explicitly
 * 2. Provides a place to add transformations later
 * 3. Decouples internal types from external API
 *
 * @param external - Todo from external API
 * @returns Todo in our internal format
 */
export function toInternalTodo(
  external: ExternalTodo
): { id: number; title: string; completed: boolean } {
  return {
    id: external.id,
    title: external.title,
    completed: external.completed,
  };
}
