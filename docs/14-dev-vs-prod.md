# Development vs Production

This document outlines the key differences between development and production modes.

## Quick Reference

| Aspect | Development | Production |
|--------|-------------|------------|
| **Port** | 8080 (webpack-dev-server) | 3000 (BFF) |
| **Rendering** | CSR (Client-Side Rendering) | SSR (Server-Side Rendering) |
| **Data Loading** | RTK Query fetches on mount | Pre-populated from server |
| **Hot Reload** | Yes (HMR enabled) | No |
| **Source Maps** | Full source maps | Disabled |
| **CSS** | Injected via JS (style-loader) | Extracted to file |
| **Service Worker** | Disabled | Enabled |
| **Bundle Size** | Not optimized | Minified + tree-shaken |
| **Caching** | No cache headers | Aggressive caching |

---

## Architecture Overview

### Development Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                    webpack-dev-server (:8080)                    │
│                                                                  │
│  • Serves index.html for all routes (historyApiFallback)        │
│  • Hot Module Replacement (HMR)                                  │
│  • Proxies /api/* to BFF                                        │
│  • Compiles TypeScript on-the-fly                               │
│  • Source maps for debugging                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ /api/* requests
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BFF (:3000)                              │
│                                                                  │
│  • API endpoints only (/api/todos, /api/bootstrap)              │
│  • SSR not used in this mode                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Production Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                         BFF (:3000)                              │
│                                                                  │
│  • Serves everything (HTML, assets, API)                        │
│  • SSR for all page routes                                      │
│  • Pre-populates Redux/RTK Query state                          │
│  • Injects __PRELOADED_STATE__ into HTML                        │
│  • Static file caching with content hashes                      │
│  • Service Worker for offline support                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Rendering

### Development: Client-Side Rendering (CSR)

```
1. Browser requests /todos
2. webpack-dev-server returns index.html (empty <div id="root">)
3. Browser loads JavaScript bundle
4. React renders loading spinner
5. useGetTodosQuery() fires fetch to /api/todos
6. Data returns, React re-renders with content
```

**Timeline:**
```
[Request] ──► [Empty HTML] ──► [JS Load] ──► [Loading...] ──► [Data Fetch] ──► [Content]
                                              ~200ms            ~100-500ms
```

### Production: Server-Side Rendering (SSR)

```
1. Browser requests /todos
2. BFF fetches data from external APIs
3. BFF renders React to HTML string (with data)
4. BFF injects __PRELOADED_STATE__ into HTML
5. Browser displays complete HTML immediately
6. JavaScript loads and hydrates (attaches event listeners)
7. useGetTodosQuery() finds cached data, no fetch needed
```

**Timeline:**
```
[Request] ──► [Server Fetch] ──► [Full HTML] ──► [JS Hydrate]
              ~100-300ms          Instant          ~200ms
```

**Key Difference:** In production, users see content immediately. In development, they see a loading spinner first.

---

## Data Flow

### Development

```typescript
// main.tsx
const preloadedState = undefined;  // No SSR state
const { store } = makeStore({ api });

// Component mounts
const { data, isLoading } = useGetTodosQuery();
// isLoading: true, data: undefined

// RTK Query fetches /api/todos
// ...

// After fetch completes
// isLoading: false, data: [...]
```

### Production

```typescript
// main.tsx
const preloadedState = readPreloadedStateFromWindow();  // Has SSR state
const { store } = makeStore({ preloadedState, api });

// Re-populate RTK Query cache (subscription tracking)
store.dispatch(api.util.upsertQueryData("getTodos", undefined, todos));

// Component mounts
const { data, isLoading } = useGetTodosQuery();
// isLoading: false, data: [...]  // Immediately available!
```

---

## Hot Module Replacement (HMR)

### Development

HMR is enabled. When you edit a file:

1. Webpack detects the change
2. Compiles only the changed module
3. Sends update to browser via WebSocket
4. React re-renders affected components
5. State is preserved (usually)

```
Edit file ──► Compile (~50ms) ──► Update in browser ──► No page reload!
```

### Production

No HMR. Changes require:

1. Rebuild the entire bundle
2. Restart the server (or redeploy)
3. Users refresh the page

---

## CSS Handling

### Development

CSS is injected via JavaScript using `style-loader`:

```javascript
// Webpack injects CSS as:
const style = document.createElement('style');
style.textContent = '...your CSS...';
document.head.appendChild(style);
```

**Pros:**
- HMR works for CSS changes
- Faster rebuild times

**Cons:**
- Flash of unstyled content (FOUC) possible
- CSS not cached separately

### Production

CSS is extracted to a separate file using `MiniCssExtractPlugin`:

```html
<link rel="stylesheet" href="/assets/app.abc123.css">
```

**Pros:**
- CSS loads in parallel with JS
- Cached independently
- No FOUC

---

## Service Worker

### Development

Service Worker is **disabled**:

```typescript
// sw-register.ts
export function registerServiceWorker(callbacks) {
  if (process.env.NODE_ENV !== "production") {
    console.log("[SW] Skipping registration in development mode");
    return;
  }
  // ...
}
```

**Why?** Service Workers cache aggressively, which makes development confusing. You'd constantly need to clear cache or use "Update on reload" in DevTools.

### Production

Service Worker is **enabled** with Workbox:

- **Precaching:** Static assets cached on install
- **Runtime caching:** API responses cached with strategies
- **Offline support:** App works without network

```typescript
// Caching strategies:
// - Static assets: CacheFirst (serve from cache, fall back to network)
// - API calls: NetworkFirst (try network, fall back to cache)
// - Images: CacheFirst with expiration
```

---

## Bundle Optimization

### Development

```javascript
// webpack.config.cjs
mode: "development",
devtool: "source-map",  // Full source maps
optimization: {
  minimize: false,      // No minification
}
```

**Bundle characteristics:**
- Large file size (~2-5MB for a typical app)
- Readable code (not minified)
- Full source maps for debugging
- Fast rebuild times

### Production

```javascript
// webpack.config.cjs
mode: "production",
devtool: false,         // No source maps
optimization: {
  minimize: true,       // Terser minification
  usedExports: true,    // Tree shaking
}
```

**Bundle characteristics:**
- Small file size (~200-500KB gzipped)
- Minified and mangled
- Tree-shaken (unused code removed)
- Content hashes for cache busting

---

## Caching

### Development

No caching. Every request fetches fresh content:

```
Cache-Control: no-cache
```

### Production

Aggressive caching based on file type:

| File Type | Cache Strategy | Duration |
|-----------|----------------|----------|
| HTML | `no-store` | Never cached |
| Hashed assets (`.abc123.js`) | `immutable` | 1 year |
| Service Worker (`sw.js`) | `no-cache` | Always revalidate |
| Other static files | `public` | 1 hour |

```typescript
// middleware.ts
if (filename === "index.html") {
  res.setHeader("Cache-Control", "no-store");
} else if (filePath.includes("/assets/")) {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
}
```

---

## Environment Variables

### Development

```bash
NODE_ENV=development
DOCKER=true  # If running in Docker
```

### Production

```bash
NODE_ENV=production
```

**Checking in code:**

```typescript
if (process.env.NODE_ENV === "production") {
  // Production-only code
}

const isProd = process.env.NODE_ENV === "production";
```

---

## Error Handling

### Development

- Full error stack traces in console
- React error overlay in browser
- Source maps point to original TypeScript

### Production

- Errors logged to server console
- User sees generic error message (ErrorBoundary)
- No source maps (can't debug in browser)

---

## Starting the Application

### Development

```bash
# Option 1: Docker (recommended)
docker-compose up

# Option 2: Local
npm run dev
```

Access at: `http://localhost:8080`

### Production

```bash
# Build all packages
npm run build

# Start server
npm start
```

Access at: `http://localhost:3000`

---

## Debugging Tips

### Development

1. **React DevTools** - Inspect component tree and state
2. **Redux DevTools** - Time-travel debugging, action log
3. **Network tab** - See RTK Query fetches
4. **Source maps** - Set breakpoints in original TypeScript

### Production

1. **Server logs** - Check console output on server
2. **Network tab** - Verify SSR response includes data
3. **View source** - Check `__PRELOADED_STATE__` is injected
4. **Lighthouse** - Performance auditing

---

## Common Issues

### "Works in dev but not in prod"

**Symptom:** Feature works on port 8080 but breaks on port 3000.

**Common causes:**
1. SSR hydration mismatch (server and client render different content)
2. Browser-only APIs used during SSR (`window`, `localStorage`)
3. Missing preloaded state handling

**Debug:**
```typescript
// Check if running on server
if (typeof window === "undefined") {
  // Server-side code
}
```

### "Works in prod but not in dev"

**Symptom:** Feature works on port 3000 but breaks on port 8080.

**Common causes:**
1. Relying on SSR-injected data that doesn't exist in dev
2. API proxy not configured correctly
3. CORS issues (dev server on different port)

**Debug:**
- Check Network tab for failed requests
- Verify webpack proxy configuration
- Check console for CORS errors

---

## Summary

| Use Development When... | Use Production When... |
|------------------------|------------------------|
| Writing and testing code | Deploying to users |
| Debugging issues | Performance testing |
| Rapid iteration | SEO testing (SSR) |
| Learning the codebase | Load testing |
