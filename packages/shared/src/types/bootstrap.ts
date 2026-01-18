/**
 * @fileoverview Core type definitions for the bootstrap payload system
 *
 * WHY THESE TYPES EXIST:
 * These types define the "contract" between server and client. When the server
 * sends data to the client, both sides need to agree on the structure. By
 * defining types in a shared package, we get:
 *
 * 1. TYPE SAFETY - TypeScript catches mismatches at compile time
 * 2. DOCUMENTATION - Types serve as documentation of the API
 * 3. AUTOCOMPLETE - IDEs can suggest properties and catch typos
 * 4. REFACTORING - Change the type, and TypeScript shows all affected code
 *
 * KEY CONCEPT: DISCRIMINATED UNIONS
 * The BootstrapPayload type is a "discriminated union" - a union of types
 * that share a common property (page.kind) that tells them apart.
 *
 * This pattern enables exhaustive type checking:
 * ```typescript
 * switch (payload.page.kind) {
 *   case "home":
 *     // TypeScript knows page is { kind: "home" }
 *     break;
 *   case "todos":
 *     // TypeScript knows page has todos property
 *     break;
 *   case "error":
 *     // TypeScript knows page has status, code, message
 *     break;
 *   // No default needed - TypeScript ensures all cases are handled
 * }
 * ```
 */

// ============================================================================
// TODO TYPE
// ============================================================================

/**
 * Represents a single todo item.
 *
 * This is the shape of todo data throughout the application.
 * It matches the structure from the external API (JSONPlaceholder)
 * but only includes fields we actually use.
 *
 * @example
 * const todo: Todo = {
 *   id: 1,
 *   title: "Learn TypeScript",
 *   completed: false
 * };
 */
export type Todo = {
  /** Unique identifier for the todo */
  id: number;
  /** The todo's text content */
  title: string;
  /** Whether the todo has been completed */
  completed: boolean;
};

// ============================================================================
// PAGE TYPES
// ============================================================================

/**
 * Page data for the home page.
 *
 * The home page is simple - it just needs to render.
 * No additional data required beyond the base payload.
 */
type HomePage = {
  kind: "home";
};

/**
 * Page data for the todos page.
 *
 * Includes the list of todos to display. This data is fetched
 * on the server and sent to the client for SSR hydration.
 */
type TodosPage = {
  kind: "todos";
  /** List of todo items to display */
  todos: Todo[];
};

/**
 * Page data for error states.
 *
 * When something goes wrong loading a page, we render an error state
 * instead of crashing. This includes enough info to:
 * - Show a user-friendly message
 * - Log details for debugging
 * - Potentially retry the operation
 */
type ErrorPage = {
  kind: "error";
  /**
   * HTTP status code (e.g., 500, 504) or 0 for non-HTTP errors.
   * Used for logging and potentially different error UI.
   */
  status: number;
  /**
   * Machine-readable error code for categorization.
   * - BOOTSTRAP_TIMEOUT: Request took too long
   * - BOOTSTRAP_UPSTREAM: Server returned an error
   * - BOOTSTRAP_UNKNOWN: Unexpected failure
   */
  code: "BOOTSTRAP_TIMEOUT" | "BOOTSTRAP_UPSTREAM" | "BOOTSTRAP_UNKNOWN";
  /**
   * Human-readable error message to display to users.
   * Should be friendly and actionable, not technical.
   */
  message: string;
};

// ============================================================================
// BOOTSTRAP PAYLOAD
// ============================================================================

/**
 * The complete data payload sent from server to client for SSR hydration.
 *
 * This is the main type used throughout the application for initial page data.
 * It's a discriminated union - the `page.kind` property determines which
 * variant we're dealing with.
 *
 * HOW IT'S USED:
 * 1. Server generates this based on the requested route
 * 2. Server renders React with this data
 * 3. Server injects this as JSON in the HTML
 * 4. Client reads it and hydrates React with the same data
 *
 * @example
 * // Type narrowing with discriminated union
 * function renderPage(payload: BootstrapPayload) {
 *   if (payload.page.kind === "todos") {
 *     // TypeScript knows payload.page.todos exists here
 *     return <TodoList todos={payload.page.todos} />;
 *   }
 *   if (payload.page.kind === "error") {
 *     // TypeScript knows payload.page.message exists here
 *     return <ErrorMessage message={payload.page.message} />;
 *   }
 *   return <HomePage />;
 * }
 */
export type BootstrapPayload =
  | {
      /** The route this payload is for (e.g., "/", "/todos") */
      route: string;
      /** Personalized greeting message (e.g., "Welcome back, John!") */
      greeting: string;
      /** Home page data */
      page: HomePage;
    }
  | {
      route: string;
      greeting: string;
      /** Todos page data with todo list */
      page: TodosPage;
    }
  | {
      route: string;
      greeting: string;
      /** Error page data with error details */
      page: ErrorPage;
    };
