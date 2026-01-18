/**
 * @fileoverview Type definitions for external API responses
 *
 * WHY SEPARATE TYPES FILE?
 * We fetch data from external APIs (like JSONPlaceholder). These APIs have
 * their own response formats that may differ from our internal types.
 *
 * By defining external types separately, we:
 * 1. DOCUMENT the external API contract
 * 2. ISOLATE changes - if the API changes, we update one place
 * 3. TRANSFORM data - map external shapes to our internal types
 *
 * EXTERNAL vs INTERNAL TYPES:
 * - External: What the API returns (may have extra fields, different names)
 * - Internal: What our app uses (defined in @restart/shared)
 *
 * We transform external -> internal in the data fetching layer.
 */

/**
 * User object from JSONPlaceholder API.
 *
 * @see https://jsonplaceholder.typicode.com/users
 *
 * Note: The actual API returns many more fields (address, phone, website, etc.)
 * We only define what we use to keep things simple.
 */
export type ExternalUser = {
  /** Unique user identifier */
  id: number;
  /** User's full name (e.g., "Leanne Graham") */
  name: string;
  /** User's username (e.g., "Bret") */
  username: string;
  /** User's email address */
  email?: string;
};

/**
 * Todo object from JSONPlaceholder API.
 *
 * @see https://jsonplaceholder.typicode.com/todos
 *
 * This matches our internal Todo type exactly, but we define it separately
 * because external APIs can change independently of our internal types.
 */
export type ExternalTodo = {
  /** Unique todo identifier */
  id: number;
  /** ID of the user who owns this todo */
  userId?: number;
  /** The todo's text content */
  title: string;
  /** Whether the todo has been completed */
  completed: boolean;
};
