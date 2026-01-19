# Service Workers (Workbox)

This document explains what service workers are, how they work, why they're necessary, and the implementation decisions made for this project.

## What Is a Service Worker?

A **service worker** is a JavaScript file that runs in the background, separate from your web page. Think of it as a programmable proxy between your web app and the network.

```
Without Service Worker:
┌────────────────┐                              ┌────────────────┐
│   Your App     │ ────── Every request ──────► │    Network     │
│   (Browser)    │ ◄───── Every response ────── │    (Server)    │
└────────────────┘                              └────────────────┘
                    ❌ Offline = App broken

With Service Worker:
┌────────────────┐     ┌────────────────┐       ┌────────────────┐
│   Your App     │ ──► │ Service Worker │ ─?──► │    Network     │
│   (Browser)    │ ◄── │   (Proxy)      │ ◄─?── │    (Server)    │
└────────────────┘     └────────────────┘       └────────────────┘
                              │
                              ▼
                       ┌────────────┐
                       │   Cache    │
                       │  (Local)   │
                       └────────────┘
                    ✓ Offline = App works!
```

### Key Characteristics

| Property | Explanation |
|----------|-------------|
| **Runs in background** | Separate thread from your main JavaScript |
| **No DOM access** | Can't touch `document` or `window` directly |
| **Event-driven** | Wakes up to handle events, then sleeps |
| **HTTPS only** | Security requirement (except localhost) |
| **Persistent** | Survives page refreshes and browser restarts |

---

## Why Are Service Workers Necessary?

### 1. Offline Support

Without a service worker, opening your app without internet shows nothing. With one, users can still use the app with cached data.

### 2. Performance

Serving assets from local cache is **much faster** than network:

| Source | Typical Latency |
|--------|-----------------|
| Memory cache | < 1ms |
| Disk cache (SW) | 5-20ms |
| Network (fast) | 50-200ms |
| Network (slow/3G) | 500-5000ms |

### 3. Reliability

Networks are unreliable. Service workers provide:
- Cached fallbacks when network fails
- Background sync when connection returns
- Consistent experience across network conditions

### 4. Native App Features

Service workers enable "Progressive Web App" (PWA) features:
- Install to home screen
- Push notifications
- Background sync
- Offline-first experience

---

## Service Worker Lifecycle

Understanding the lifecycle is crucial for debugging:

```
┌─────────────────────────────────────────────────────────────────┐
│                     REGISTRATION                                 │
│   Browser downloads sw.js and starts parsing                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INSTALLATION                                │
│   'install' event fires                                          │
│   • Download resources to cache (precaching)                     │
│   • If any download fails, installation fails                    │
│   • SW waits in "waiting" state                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ACTIVATION                                 │
│   'activate' event fires when:                                   │
│   • First install (no previous SW)                               │
│   • Previous SW is gone (all tabs closed)                        │
│   • skipWaiting() was called                                     │
│                                                                  │
│   Common tasks:                                                  │
│   • Clean up old caches                                          │
│   • Claim clients (take control of pages)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         RUNNING                                  │
│   SW controls pages and handles events:                          │
│   • 'fetch' - Intercept network requests                         │
│   • 'message' - Receive messages from pages                      │
│   • 'push' - Handle push notifications                           │
│   • 'sync' - Handle background sync                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        UPDATE                                    │
│   When sw.js changes:                                            │
│   • New SW installs alongside old one                            │
│   • New SW waits until old one releases control                  │
│   • Or skipWaiting() forces immediate activation                 │
└─────────────────────────────────────────────────────────────────┘
```

### The "Waiting" Problem

By default, a new service worker waits until **all tabs** using the old one are closed. This can be confusing:

```
Tab 1: Opens app (SW v1 installs and activates)
Tab 2: Opens app (SW v1 controls)

Deploy new version (SW v2)

Tab 1: Refreshes (SW v2 installs but WAITS)
Tab 2: Still uses SW v1
Tab 1: Still uses SW v1 (!)

Close Tab 2...

Tab 1: Refresh → Now uses SW v2
```

**Our decision:** We call `skipWaiting()` to activate immediately. This is safe because our assets have content hashes (new code = new filename).

---

## Caching Strategies

Workbox provides several built-in caching strategies:

### 1. Cache First

```
Request → Check Cache → Found? → Return cached
                     ↓ Not found
                   Network → Cache response → Return
```

**Best for:** Static assets that don't change (images, fonts, hashed JS/CSS)

**Our usage:** `/assets/*` files (content-hashed, immutable)

### 2. Network First

```
Request → Try Network → Success? → Cache response → Return
                     ↓ Failed
                   Check Cache → Return cached (or fail)
```

**Best for:** Dynamic content where freshness matters

**Our usage:**
- `/api/*` endpoints (want fresh data, cache as fallback)
- HTML pages (SSR content may change)

### 3. Stale While Revalidate

```
Request → Return cached immediately
       ↘ Fetch from network in background
         Update cache for next time
```

**Best for:** Content that should be fast but reasonably fresh

**Our usage:** Not currently used, but good for user avatars, non-critical data

### 4. Network Only

```
Request → Network → Return (no caching)
```

**Best for:** Requests that should never be cached (logout, purchases)

### 5. Cache Only

```
Request → Cache → Return (no network)
```

**Best for:** Precached resources you know exist

---

## Our Implementation

### File Structure

```
apps/web/src/
├── service-worker.ts      # The actual service worker
├── service-worker.d.ts    # TypeScript declarations
├── sw-register.ts         # Registration logic
└── main.tsx               # Calls registration

apps/bff/src/http/
└── middleware.ts          # Serves sw.js with correct headers
```

### Why InjectManifest (Not GenerateSW)?

Workbox offers two approaches:

| GenerateSW | InjectManifest |
|------------|----------------|
| Generates entire SW for you | You write SW, Workbox injects manifest |
| Less control | Full control |
| Can't add custom logic | Custom caching strategies |
| Good for simple apps | Good for complex apps |

**Our decision:** `InjectManifest` because:
1. SSR apps need custom handling (HTML is dynamic)
2. We want control over which routes use which strategy
3. We can add custom message handlers

### Webpack Configuration

```javascript
// apps/web/webpack.config.cjs
new InjectManifest({
  // Source file we wrote
  swSrc: path.resolve(__dirname, "src/service-worker.ts"),

  // Output filename (at root for max scope)
  swDest: "sw.js",

  // Don't precache these
  exclude: [/\.map$/, /manifest\.json$/, /index\.html$/],

  // Max file size to precache
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
})
```

**Why exclude index.html?**

Our HTML is server-rendered with dynamic content. If we precached it:
1. User would see stale HTML
2. Bootstrap data might be wrong
3. User-specific content might leak to wrong user

Instead, we use `NetworkFirst` for navigation requests.

### Registration Strategy

```typescript
// apps/web/src/sw-register.ts
export function registerServiceWorker(config?: RegisterConfig): void {
  // Only in production - dev mode caching causes confusion
  if (process.env.NODE_ENV !== "production") return;

  // Check browser support
  if (!("serviceWorker" in navigator)) return;

  // Wait for page load - don't compete with app resources
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
```

**Why wait for load?**

Registering a service worker triggers downloads (the SW file, precached resources). If we do this immediately, we compete with the app's JavaScript and CSS. Waiting for `load` ensures the app appears first.

### Caching Decisions

| Resource | Strategy | Why |
|----------|----------|-----|
| `/api/*` | NetworkFirst (5 min cache) | Want fresh data, offline fallback |
| `/assets/*` | CacheFirst (1 year) | Content-hashed, never changes |
| Images | CacheFirst (30 days) | Rarely change, expensive to download |
| Fonts | CacheFirst (1 year) | Never change |
| HTML pages | NetworkFirst (24 hour) | SSR content, want fresh but offline fallback |

---

## Server Configuration

Service workers require specific headers:

```typescript
// apps/bff/src/http/middleware.ts
if (filename === "sw.js") {
  // Don't cache the SW file itself
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  // Allow SW to control all paths
  res.setHeader("Service-Worker-Allowed", "/");
}
```

**Why no caching for sw.js?**

The browser checks for SW updates by fetching `sw.js` and comparing contents. If we cached it, users would never get updates.

**Why Service-Worker-Allowed?**

By default, a SW can only control paths at its level and below:
- `/sw.js` can control `/` and everything under it ✓
- `/scripts/sw.js` can only control `/scripts/*` ✗

We serve from root, so this header is optional but explicit.

---

## Debugging Service Workers

### Chrome DevTools

1. Open DevTools → Application → Service Workers
2. See registered SWs, their status, and controls
3. "Update on reload" checkbox forces update on every reload
4. "Bypass for network" disables SW (good for debugging)

### Common Issues

#### 1. Changes Not Appearing

**Symptom:** Updated code, but old version shows

**Causes:**
- SW serving cached content
- New SW waiting (not activated)

**Fix:**
```javascript
// Force update in DevTools:
// Application → Service Workers → Update

// Or programmatically:
navigator.serviceWorker.ready.then(reg => reg.update());
```

#### 2. "This site can be installed" Not Showing

**Requirements for PWA install prompt:**
- HTTPS (or localhost)
- Valid manifest.json
- Service worker registered
- Meets engagement heuristics

#### 3. SW Not Updating

**Symptom:** Deploy new version, users see old SW

**Cause:** Browser cache serving old sw.js

**Fix:** Ensure server sends correct headers:
```
Cache-Control: no-cache, no-store, must-revalidate
```

#### 4. Infinite Redirect Loop

**Symptom:** Page keeps reloading

**Cause:** SW returning cached redirect

**Fix:** Check your navigation route handling

### Useful Console Commands

```javascript
// Check if SW is active
navigator.serviceWorker.controller

// Get registration
navigator.serviceWorker.ready.then(console.log)

// Force SW update
navigator.serviceWorker.ready.then(r => r.update())

// Unregister all SWs
navigator.serviceWorker.getRegistrations().then(regs =>
  regs.forEach(r => r.unregister())
)

// Clear all caches
caches.keys().then(keys =>
  keys.forEach(k => caches.delete(k))
)
```

---

## Gotchas and Pitfalls

### 1. Don't Cache Auth/Personal Data Globally

```typescript
// BAD: Caches user-specific data for everyone
registerRoute(
  /\/api\/user/,
  new CacheFirst()
);

// GOOD: Use private per-session cache or no cache
registerRoute(
  /\/api\/user/,
  new NetworkOnly()
);
```

### 2. Content Hash Changes Require New SW

If your build outputs `app.abc123.js` and next build outputs `app.def456.js`, the precache manifest changes, triggering SW update.

### 3. Service Workers Are Async

You can't synchronously check cache. All SW operations return Promises.

### 4. SW Scope Limitations

A SW at `/app/sw.js` cannot control `/other/page.html`. Plan your URL structure.

### 5. No localStorage/sessionStorage

Service workers can't access storage APIs. Use `IndexedDB` or `Cache API`.

---

## When NOT to Use Service Workers

Service workers add complexity. Skip them if:

1. **Simple static site** - Browser caching might be enough
2. **Real-time data only** - If stale data is worse than no data
3. **Auth-heavy app** - Caching complexities with user sessions
4. **Development** - Disable in dev mode (we do this)

---

## Testing Offline Behavior

### Chrome DevTools

1. Network tab → "Offline" checkbox
2. Reload page → Should show cached content

### Programmatic Check

```typescript
// Check if online
window.addEventListener('online', () => console.log('Online'));
window.addEventListener('offline', () => console.log('Offline'));

// Current status
navigator.onLine // true or false
```

### What to Test

1. **First visit** - SW installs, precaches assets
2. **Second visit** - Assets served from cache
3. **Offline visit** - App loads from cache
4. **Update deployed** - New SW activates
5. **Clear cache** - Fresh install works

---

## Alternative Approaches

### 1. GenerateSW (Simpler Workbox)

For simpler apps, let Workbox generate everything:

```javascript
new GenerateSW({
  clientsClaim: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\./,
      handler: 'NetworkFirst',
    },
  ],
})
```

### 2. No Build Tool (Workbox CDN)

```javascript
// sw.js
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

workbox.routing.registerRoute(
  /\.js$/,
  new workbox.strategies.CacheFirst()
);
```

### 3. Framework Built-in

- **Next.js:** `next-pwa` package
- **Create React App:** Built-in SW template
- **Vite:** `vite-plugin-pwa`

---

## Summary

| Aspect | Our Decision | Why |
|--------|--------------|-----|
| Tool | Workbox InjectManifest | Full control for SSR app |
| Production only | Yes | Dev caching causes confusion |
| skipWaiting | Yes | Fast updates, content-hashed assets |
| HTML caching | NetworkFirst | SSR = dynamic content |
| Asset caching | CacheFirst | Immutable (content-hashed) |
| API caching | NetworkFirst | Fresh data, offline fallback |
| Server headers | no-cache for sw.js | Ensure updates reach users |

Service workers are powerful but complex. Start simple, add complexity as needed, and always test offline behavior thoroughly.
