/**
 * Type declarations for service worker globals
 *
 * Service workers have a different global scope than regular web pages.
 * This file tells TypeScript about the service worker-specific types.
 */

/// <reference lib="webworker" />

// Extend the ServiceWorkerGlobalScope to include Workbox's injected manifest
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Export empty object to make this a module
export {};
