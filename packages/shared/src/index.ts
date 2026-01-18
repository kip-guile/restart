/**
 * @fileoverview Main entry point for the @restart/shared package
 *
 * This package contains code shared between the server (BFF) and client (web).
 * By centralizing shared code here, we:
 *
 * 1. AVOID DUPLICATION - Write once, use everywhere
 * 2. ENSURE CONSISTENCY - Same types and logic on both sides
 * 3. SIMPLIFY IMPORTS - Single package to import from
 *
 * WHAT'S INCLUDED:
 *
 * TYPES (./types):
 * - BootstrapPayload: Main SSR data structure
 * - Todo: Todo item type
 *
 * UTILITIES (./utils):
 * - sleep: Async delay function
 * - fetchJson, fetchJsonOrThrow: HTTP utilities with retry/timeout
 * - makeErrorBootstrap, makeHomeBootstrap, makeTodosBootstrap: Factories
 * - isValidBootstrapPayload, isValidPreloadedState: Validators
 * - BOOTSTRAP_ERROR_CODES, BOOTSTRAP_ERROR_MESSAGES: Constants
 *
 * @example
 * // Import types
 * import type { BootstrapPayload, Todo } from '@restart/shared';
 *
 * // Import utilities
 * import { makeErrorBootstrap, fetchJson } from '@restart/shared';
 */

// Re-export all types
export * from "./types/index.js";

// Re-export all utilities
export * from "./utils/index.js";
