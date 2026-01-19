/**
 * @fileoverview Service Worker with Workbox
 *
 * WHAT IS A SERVICE WORKER?
 * A service worker is a script that runs in the background, separate from
 * your web page. It acts as a programmable network proxy, intercepting
 * network requests and deciding how to respond.
 *
 * KEY CAPABILITIES:
 * 1. OFFLINE SUPPORT - Serve cached content when network is unavailable
 * 2. CACHING STRATEGIES - Control how resources are fetched and stored
 * 3. BACKGROUND SYNC - Queue actions when offline, execute when online
 * 4. PUSH NOTIFICATIONS - Receive push messages from server
 *
 * LIFECYCLE:
 * 1. Registration - Browser downloads and parses the SW
 * 2. Installation - SW installs, precaches resources
 * 3. Activation - SW takes control of pages
 * 4. Fetch - SW intercepts network requests
 *
 * WHY WORKBOX?
 * Writing service workers from scratch is complex and error-prone.
 * Workbox provides:
 * - Pre-built caching strategies (CacheFirst, NetworkFirst, etc.)
 * - Automatic cache management (expiration, size limits)
 * - Precaching with revision control
 * - Easy-to-use routing API
 */

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
} from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// Declare the self variable for TypeScript
declare const self: ServiceWorkerGlobalScope;

// ============================================================================
// PRECACHING
// ============================================================================
/**
 * Precaching downloads and caches resources during service worker installation.
 * These resources are available immediately on subsequent visits.
 *
 * The __WB_MANIFEST placeholder is replaced by Workbox with the list of
 * all assets generated during the build (JS, CSS, etc.).
 *
 * Each entry includes a revision hash, so Workbox knows when to update
 * the cached version.
 */
precacheAndRoute(self.__WB_MANIFEST);

/**
 * Remove old caches from previous service worker versions.
 * Workbox creates new caches when the precache manifest changes.
 * This cleans up caches that are no longer needed.
 */
cleanupOutdatedCaches();

// ============================================================================
// CACHING STRATEGIES
// ============================================================================

/**
 * STRATEGY: NetworkFirst
 * Try network first, fall back to cache if offline.
 *
 * BEST FOR: API requests, dynamic content
 * WHY: We want fresh data when possible, but cached data is better than nothing
 */
const networkFirstStrategy = new NetworkFirst({
  cacheName: "api-cache",
  plugins: [
    // Only cache successful responses
    new CacheableResponsePlugin({
      statuses: [0, 200],
    }),
    // Limit cache size and age
    new ExpirationPlugin({
      maxEntries: 50,
      maxAgeSeconds: 5 * 60, // 5 minutes
    }),
  ],
});

/**
 * STRATEGY: CacheFirst
 * Try cache first, fall back to network if not cached.
 *
 * BEST FOR: Static assets that don't change (images, fonts)
 * WHY: These rarely change, so cache hits are safe and fast
 */
const cacheFirstStrategy = new CacheFirst({
  cacheName: "static-assets",
  plugins: [
    new CacheableResponsePlugin({
      statuses: [0, 200],
    }),
    new ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
    }),
  ],
});

/**
 * STRATEGY: StaleWhileRevalidate
 * Serve from cache immediately, but fetch update in background.
 *
 * BEST FOR: Resources that should be fast but reasonably fresh
 * WHY: User sees content instantly, gets updates on next visit
 */
const staleWhileRevalidateStrategy = new StaleWhileRevalidate({
  cacheName: "dynamic-content",
  plugins: [
    new CacheableResponsePlugin({
      statuses: [0, 200],
    }),
    new ExpirationPlugin({
      maxEntries: 50,
      maxAgeSeconds: 24 * 60 * 60, // 24 hours
    }),
  ],
});

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

/**
 * API Routes - NetworkFirst
 *
 * For /api/* requests, we want fresh data but can fall back to cache.
 * This enables offline functionality for previously-fetched data.
 */
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  networkFirstStrategy
);

/**
 * Static Assets (JS, CSS) - CacheFirst
 *
 * Our static assets have content hashes in filenames (app.abc123.js).
 * If the filename is in cache, it's guaranteed to be the correct version.
 * New versions get new filenames, so they'll be fetched fresh.
 */
registerRoute(
  ({ request, url }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    url.pathname.startsWith("/assets/"),
  cacheFirstStrategy
);

/**
 * Images - CacheFirst with long expiration
 *
 * Images rarely change and are expensive to download.
 * Cache aggressively with a size limit to prevent storage bloat.
 */
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "images",
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

/**
 * Fonts - CacheFirst with long expiration
 *
 * Fonts almost never change and are used on every page.
 * Cache them aggressively for best performance.
 */
registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({
    cacheName: "fonts",
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  })
);

/**
 * Navigation Requests (HTML pages) - NetworkFirst
 *
 * For SSR apps, HTML contains dynamic content (user data, bootstrap state).
 * We want fresh content when online, but can show cached content offline.
 *
 * IMPORTANT: This is separate from precaching because:
 * 1. SSR pages are generated dynamically (not in build output)
 * 2. Each page may have different bootstrap data
 * 3. We want network-first behavior, not cache-first
 */
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: "pages",
      plugins: [
        new CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        }),
      ],
    }),
    {
      // Don't cache API routes as navigation
      denylist: [/^\/api\//],
    }
  )
);

// ============================================================================
// SERVICE WORKER LIFECYCLE EVENTS
// ============================================================================

/**
 * Skip Waiting
 *
 * By default, a new service worker waits until all tabs are closed
 * before activating. skipWaiting() activates immediately.
 *
 * TRADE-OFF:
 * - PRO: Users get updates faster
 * - CON: Can cause issues if old cached resources are incompatible
 *        with new code (rare with content-hashed filenames)
 */
self.addEventListener("install", (event) => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  self.skipWaiting();
});

/**
 * Claim Clients
 *
 * By default, a service worker doesn't control existing tabs until
 * they're reloaded. clients.claim() takes control immediately.
 *
 * Combined with skipWaiting, this means new service workers
 * take effect on all tabs immediately.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Message Handler
 *
 * Allow the main thread to communicate with the service worker.
 * Useful for:
 * - Triggering cache updates
 * - Clearing specific caches
 * - Getting cache status
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_VERSION") {
    // Respond with the service worker version
    // In a real app, you'd use a build-time injected version
    event.ports[0]?.postMessage({ version: "1.0.0" });
  }

  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
