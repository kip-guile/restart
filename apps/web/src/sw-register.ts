/**
 * @fileoverview Service Worker Registration
 *
 * This module handles registering and managing the service worker.
 * It's separate from the main app to keep concerns isolated.
 *
 * REGISTRATION FLOW:
 * 1. Check if service workers are supported
 * 2. Wait for the page to load (don't block initial render)
 * 3. Register the service worker
 * 4. Handle updates (new versions available)
 *
 * WHY WAIT FOR LOAD?
 * Service worker registration makes network requests (downloading sw.js).
 * If we register immediately, we compete with the app's initial resources.
 * Waiting for load ensures the app loads fast, then SW registers.
 */

// ============================================================================
// TYPES
// ============================================================================

type UpdateCallback = (registration: ServiceWorkerRegistration) => void;

interface RegisterConfig {
  /** Called when a new service worker is waiting to activate */
  onUpdate?: UpdateCallback;
  /** Called when content is cached for offline use */
  onSuccess?: UpdateCallback;
  /** Called when registration fails */
  onError?: (error: Error) => void;
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Registers the service worker.
 *
 * Call this function once when your app starts. It handles:
 * - Checking browser support
 * - Waiting for page load
 * - Registering the SW
 * - Setting up update handlers
 *
 * @param config - Optional callbacks for SW lifecycle events
 *
 * @example
 * registerServiceWorker({
 *   onUpdate: (registration) => {
 *     // Show "Update available" prompt to user
 *     showUpdateNotification();
 *   },
 *   onSuccess: () => {
 *     console.log('App is available offline');
 *   },
 * });
 */
export function registerServiceWorker(config?: RegisterConfig): void {
  // Only register in production
  // In development, service workers cause caching confusion
  if (process.env.NODE_ENV !== "production") {
    console.log("[SW] Skipping registration in development mode");
    return;
  }

  // Check browser support
  if (!("serviceWorker" in navigator)) {
    console.log("[SW] Service workers not supported");
    return;
  }

  // Wait for page load to not compete with app resources
  window.addEventListener("load", () => {
    const swUrl = "/sw.js";

    registerValidSW(swUrl, config);
  });
}

/**
 * Registers a service worker at the given URL.
 *
 * @param swUrl - URL to the service worker file
 * @param config - Optional callbacks
 */
async function registerValidSW(
  swUrl: string,
  config?: RegisterConfig
): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register(swUrl, {
      // Scope determines which pages the SW controls
      // "/" means all pages in the origin
      scope: "/",
    });

    console.log("[SW] Registered successfully");

    // Check for updates periodically (every hour)
    setInterval(() => {
      registration.update().catch(console.error);
    }, 60 * 60 * 1000);

    // Handle the different states
    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.onstatechange = () => {
        if (installingWorker.state === "installed") {
          if (navigator.serviceWorker.controller) {
            // New content available; old content has been purged
            // This means a new version of the SW is waiting
            console.log("[SW] New content available; please refresh");
            config?.onUpdate?.(registration);
          } else {
            // First install - content is cached for offline use
            console.log("[SW] Content cached for offline use");
            config?.onSuccess?.(registration);
          }
        }
      };
    };
  } catch (error) {
    console.error("[SW] Registration failed:", error);
    config?.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Unregisters all service workers.
 *
 * Use this when you want to completely disable service workers,
 * for example during development or debugging.
 *
 * @example
 * // In browser console:
 * import { unregisterServiceWorker } from './sw-register';
 * unregisterServiceWorker();
 */
export async function unregisterServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const success = await registration.unregister();

    if (success) {
      console.log("[SW] Unregistered successfully");
    } else {
      console.log("[SW] Unregistration failed");
    }
  } catch (error) {
    console.error("[SW] Error during unregistration:", error);
  }
}

/**
 * Sends a message to the active service worker.
 *
 * @param message - The message to send
 * @returns Promise that resolves with the response (if any)
 *
 * @example
 * // Skip waiting (activate new SW immediately)
 * sendMessageToSW({ type: 'SKIP_WAITING' });
 *
 * // Clear all caches
 * sendMessageToSW({ type: 'CLEAR_CACHE' });
 *
 * // Get SW version
 * const { version } = await sendMessageToSW({ type: 'GET_VERSION' });
 */
export function sendMessageToSW(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      reject(new Error("No active service worker"));
      return;
    }

    // Create a message channel for the response
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    // Send the message with the response port
    navigator.serviceWorker.controller.postMessage(message, [
      messageChannel.port2,
    ]);

    // Timeout after 5 seconds
    setTimeout(() => {
      reject(new Error("Service worker message timeout"));
    }, 5000);
  });
}

/**
 * Checks if a service worker update is available.
 *
 * @returns Promise that resolves to true if update is waiting
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    return registration.waiting !== null;
  } catch {
    return false;
  }
}

/**
 * Forces the waiting service worker to activate.
 *
 * Use this after showing an "Update available" prompt and
 * the user clicks "Update now".
 *
 * @example
 * function UpdatePrompt() {
 *   return (
 *     <button onClick={() => {
 *       skipWaiting();
 *       window.location.reload();
 *     }}>
 *       Update available - Click to refresh
 *     </button>
 *   );
 * }
 */
export async function skipWaiting(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;

  if (registration.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }
}
