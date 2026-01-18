/**
 * @fileoverview External API module exports
 *
 * This barrel file provides a clean interface to external API functionality.
 * Import from here instead of reaching into individual files:
 *
 * ```typescript
 * // Good
 * import { getUserName, getTodos } from './external/index.js';
 *
 * // Avoid
 * import { getUserName } from './external/api.js';
 * import { ExternalUser } from './external/types.js';
 * ```
 */

export * from "./types.js";
export * from "./api.js";
