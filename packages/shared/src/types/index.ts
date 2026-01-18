/**
 * @fileoverview Type exports for the shared package
 *
 * This barrel file re-exports all types from the types directory.
 * Using a barrel file provides a single import point:
 *
 * ```typescript
 * // Instead of:
 * import { BootstrapPayload } from '@restart/shared/types/bootstrap';
 * import { ApiResponse } from '@restart/shared/types/api';
 *
 * // You can do:
 * import { BootstrapPayload, ApiResponse } from '@restart/shared';
 * ```
 */

export * from "./bootstrap.js";
