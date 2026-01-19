# Isomorphic State Transfer

This document explains how state moves from the server to the client during SSR.

## Overview

"Isomorphic" (or "universal") code runs on both server and client. The challenge is transferring state between them:

```
┌─────────────────────────────────────────────────────────────────┐
│                           SERVER                                 │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ Fetch Data  │───►│ Redux Store │───►│ Serialize to JSON   │  │
│  │ from APIs   │    │ (with data) │    │ in HTML             │  │
│  └─────────────┘    └─────────────┘    └──────────┬──────────┘  │
│                                                    │             │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │
                            HTML with embedded JSON  │
                                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                           CLIENT                                 │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ Parse JSON from     │───►│ Redux Store │───►│ Hydrate     │  │
│  │ window globals      │    │ (restored)  │    │ React       │  │
│  └─────────────────────┘    └─────────────┘    └─────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## The Two Payloads

This project transfers two pieces of state:

### 1. Bootstrap Payload

**Purpose:** Page-specific data needed for initial render

```typescript
type BootstrapPayload =
  | { route: string; greeting: string; page: { kind: "home" } }
  | { route: string; greeting: string; page: { kind: "todos"; todos: Todo[] } }
  | { route: string; greeting: string; page: { kind: "error"; ... } };
```

**Injected as:**
```html
<script>
  window.__BOOTSTRAP__ = {
    "route": "/todos",
    "greeting": "Hello, Alex!",
    "page": {
      "kind": "todos",
      "todos": [...]
    }
  };
</script>
```

### 2. Preloaded State

**Purpose:** Complete Redux store state for hydration

```typescript
type RootState = {
  app: {
    message: string;
    bootstrap: BootstrapPayload | null;
  };
  api: {
    queries: Record<string, CachedQuery>;
    mutations: Record<string, CachedMutation>;
    // ... RTK Query internal state
  };
};
```

**Injected as:**
```html
<script>
  window.__PRELOADED_STATE__ = {
    "app": {
      "message": "Hello, Alex!",
      "bootstrap": { ... }
    },
    "api": { ... }
  };
</script>
```

### Why Both?

| Payload | Used For |
|---------|----------|
| Bootstrap | Client-side navigation (fetching new page data) |
| Preloaded State | Hydration (restoring exact Redux state) |

If a user navigates client-side to `/about`, we fetch bootstrap but don't need full Redux state transfer.

---

## Server: Creating State

### Step 1: Fetch Data

**File:** `apps/bff/src/server/bootstrap.ts`

```typescript
export async function getBootstrapPayload(
  ctx: RequestContext
): Promise<BootstrapPayload> {
  const { route, http } = ctx;

  switch (route) {
    case "/":
      return makeHomeBootstrap(route, await getGreeting(http));

    case "/todos":
      const [greeting, todos] = await Promise.all([
        getGreeting(http),
        getTodos(http),
      ]);
      return makeTodosBootstrap(route, greeting, todos);

    default:
      return makeErrorBootstrap(route, { status: 404 });
  }
}
```

### Step 2: Create Store and Apply Data

**File:** `apps/bff/src/server/ssr/render.tsx`

```typescript
// Create empty store
const { store } = makeStore({ apiBaseUrl: "/api" });

// Apply bootstrap data to store
applyBootstrapToStore(bootstrap, store.dispatch);

// Now store has the data needed for rendering
```

### Step 3: Render and Extract State

```typescript
// Render React (uses store state)
const appHtml = renderToString(
  <Provider store={store}>
    <StaticRouter location={url}>
      <App />
    </StaticRouter>
  </Provider>
);

// Extract final state for client
const preloadedState = store.getState();
```

### Step 4: Serialize to HTML

```typescript
const html = `
  <div id="root">${appHtml}</div>
  <script>
    window.__BOOTSTRAP__ = ${escapeJsonForHtml(bootstrap)};
    window.__PRELOADED_STATE__ = ${escapeJsonForHtml(preloadedState)};
  </script>
  <script src="${assets.js}"></script>
`;
```

---

## Client: Restoring State

### Step 1: Read from Window

**File:** `apps/web/src/bootstrap.ts`

```typescript
export function readPreloadedStateFromWindow(): Partial<RootState> | null {
  const raw = window.__PRELOADED_STATE__;
  if (!raw) return null;

  // Clean up global
  delete window.__PRELOADED_STATE__;

  // Validate structure
  if (!isValidPreloadedState(raw)) return null;

  return raw as Partial<RootState>;
}

export function readBootstrapFromWindow(): BootstrapPayload | null {
  const raw = window.__BOOTSTRAP__;
  if (!raw) return null;

  delete window.__BOOTSTRAP__;

  if (!isValidBootstrapPayload(raw)) return null;

  return raw;
}
```

### Step 2: Create Store with State

**File:** `apps/web/src/main.tsx`

```typescript
const preloadedState = readPreloadedStateFromWindow();

const { store } = makeStore({
  apiBaseUrl: "/api",
  preloadedState,  // Pass server state to store
  api: browserApi,
});
```

### Step 3: Hydrate RTK Query Cache

**This is critical and easy to get wrong!**

RTK Query stores cached data in the Redux store, and that data IS included in `preloadedState`. However, RTK Query's internal subscription tracking doesn't survive serialization.

**The Problem:**
```typescript
// Server populates cache:
store.dispatch(api.util.upsertQueryData("getTodos", undefined, todos));

// preloadedState includes:
{
  api: {
    queries: {
      "getTodos(undefined)": {
        status: "fulfilled",
        data: [/* todos */]
      }
    }
  }
}

// Client creates store with preloadedState...
// But useGetTodosQuery() still shows isLoading: true! 😱
```

**Why?** RTK Query hooks track subscriptions internally. When you pass `preloadedState`, the data is in the store, but the hook doesn't "know" about it because no subscription was ever created for that query.

**The Solution:** Explicitly populate the cache on the client, even when preloadedState exists:

**File:** `apps/web/src/main.tsx`

```typescript
// Get bootstrap data from preloaded state
let bootstrap = preloadedState?.app?.bootstrap;

if (!bootstrap) {
  // No preloaded state - fetch bootstrap
  bootstrap = await getBootstrap(window.location.pathname);
  applyBootstrapToStore(bootstrap, store.dispatch);
}

// ALWAYS seed RTK Query cache - even with preloadedState!
// This creates the subscription tracking that hooks need
if (bootstrap?.page?.kind === "todos") {
  store.dispatch(
    api.util.upsertQueryData("getTodos", undefined, bootstrap.page.todos)
  );
}
```

**Why This Works:**
- `upsertQueryData` both stores the data AND sets up proper subscription tracking
- The hook then sees the cache entry and returns `isLoading: false` with data
- No network request is made because the cache is already populated

### Step 4: Hydrate React

```typescript
const app = (
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>
);

// Store has same state as server → React renders same HTML
hydrateRoot(document.getElementById("root")!, app);
```

---

## RTK Query SSR Flow (Complete Picture)

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Fetch todos from external API                               │
│     const todos = await getTodos(http);                         │
│                                                                  │
│  2. Create bootstrap payload                                     │
│     { route: "/todos", page: { kind: "todos", todos } }         │
│                                                                  │
│  3. Create Redux store                                           │
│     const { store, api } = makeStore({ apiBaseUrl: "/api" });   │
│                                                                  │
│  4. Apply bootstrap to app slice                                 │
│     applyBootstrapToStore(bootstrap, store.dispatch);           │
│                                                                  │
│  5. Populate RTK Query cache (for SSR HTML to match)            │
│     store.dispatch(                                              │
│       api.util.upsertQueryData("getTodos", undefined, todos)    │
│     );                                                           │
│                                                                  │
│  6. Render React to HTML                                         │
│     renderToString(<App />)                                      │
│     // useGetTodosQuery() returns { data: todos, isLoading: false }
│                                                                  │
│  7. Serialize state to HTML                                      │
│     window.__PRELOADED_STATE__ = store.getState();              │
│     window.__BOOTSTRAP__ = bootstrap;                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Read preloaded state                                         │
│     const preloadedState = readPreloadedStateFromWindow();      │
│                                                                  │
│  2. Create store with preloaded state                            │
│     const { store } = makeStore({ preloadedState, api });       │
│                                                                  │
│  3. Get bootstrap from preloaded state                           │
│     const bootstrap = preloadedState.app.bootstrap;             │
│                                                                  │
│  4. RE-POPULATE RTK Query cache (critical!)                      │
│     store.dispatch(                                              │
│       api.util.upsertQueryData("getTodos", undefined, todos)    │
│     );                                                           │
│     // This creates subscription tracking that hooks need        │
│                                                                  │
│  5. Hydrate React                                                │
│     hydrateRoot(rootEl, <App />)                                │
│     // useGetTodosQuery() returns { data: todos, isLoading: false }
│     // HTML matches! No hydration mismatch.                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## CSR Mode (Development)

In development, we use Client-Side Rendering (CSR) via webpack-dev-server on port 8080. There's no SSR, so the flow is simpler:

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (CSR)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. No preloaded state (window.__PRELOADED_STATE__ is undefined) │
│     const preloadedState = undefined;                           │
│                                                                  │
│  2. Create empty store                                           │
│     const { store } = makeStore({ api });                       │
│                                                                  │
│  3. Render React immediately                                     │
│     createRoot(rootEl).render(<App />);                         │
│                                                                  │
│  4. Component mounts, useGetTodosQuery() is called              │
│     // Returns { isLoading: true, data: undefined }             │
│                                                                  │
│  5. RTK Query automatically fetches /api/todos                   │
│                                                                  │
│  6. Fetch completes, cache populated                             │
│     // Returns { isLoading: false, data: [...todos] }           │
│                                                                  │
│  7. Component re-renders with data                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why CSR in Development?

| Benefit | Explanation |
|---------|-------------|
| **Faster iteration** | No server restart needed for UI changes |
| **Hot Module Replacement** | Changes appear instantly without page reload |
| **Simpler debugging** | Single process, easier stack traces |
| **RTK Query handles everything** | Automatic fetching when cache is empty |

### Development vs Production

| Aspect | Development (CSR) | Production (SSR) |
|--------|-------------------|------------------|
| **Port** | 8080 (webpack-dev-server) | 3000 (BFF) |
| **Initial render** | Empty, then loading spinner | Full content immediately |
| **Data fetching** | Client-side via RTK Query | Pre-populated on server |
| **Time to content** | Slower (fetch after load) | Faster (content in HTML) |

---

## Validation

Always validate state before using it. Users could tamper with globals:

### Bootstrap Validation

**File:** `packages/shared/src/utils/bootstrap.ts`

```typescript
export function isValidBootstrapPayload(value: unknown): value is BootstrapPayload {
  if (typeof value !== "object" || value === null) return false;
  if (!("route" in value) || typeof value.route !== "string") return false;
  if (!("greeting" in value) || typeof value.greeting !== "string") return false;
  if (!("page" in value) || typeof value.page !== "object") return false;

  return true;
}
```

### Preloaded State Validation

```typescript
export function isValidPreloadedState(
  value: unknown
): value is { app: unknown; api?: unknown } {
  if (typeof value !== "object" || value === null) return false;
  if (!("app" in value)) return false;

  return true;
}
```

**Why validate?**
1. Catch malformed data early
2. Prevent type errors downstream
3. Security - don't trust user-controllable data

---

## Security Considerations

### XSS Prevention

JSON embedded in HTML can be exploited:

```html
<!-- Malicious data could contain: -->
{"message":"</script><script>alert('XSS')"}

<!-- Which becomes: -->
<script>
  window.__BOOTSTRAP__ = {"message":"</script><script>alert('XSS')"};
</script>
```

**The fix:** Escape dangerous characters:

```typescript
function escapeJsonForHtml(json: unknown): string {
  return JSON.stringify(json)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
```

### Sensitive Data

Never include secrets in transferred state:

```typescript
// BAD - API key exposed to browser
const bootstrap = {
  apiKey: process.env.API_KEY,  // DON'T DO THIS
  data: fetchedData,
};

// GOOD - Only include user-safe data
const bootstrap = {
  data: fetchedData,  // Just the data the user should see
};
```

### Cleanup After Reading

Delete globals after reading to prevent:
- Accidental re-use
- Data lingering in memory
- Inspection via DevTools (though determined users can still see)

```typescript
const state = window.__PRELOADED_STATE__;
delete window.__PRELOADED_STATE__;  // Clean up immediately
```

---

## Type Safety Across Boundaries

### Shared Types

**File:** `packages/shared/src/types/bootstrap.ts`

```typescript
// This type is used on BOTH server and client
export type BootstrapPayload =
  | { route: string; greeting: string; page: HomePage }
  | { route: string; greeting: string; page: TodosPage }
  | { route: string; greeting: string; page: ErrorPage };
```

### Server Creates

```typescript
// Server uses shared type
import { BootstrapPayload } from "@restart/shared";

function createBootstrap(): BootstrapPayload {
  return {
    route: "/todos",
    greeting: "Hello!",
    page: { kind: "todos", todos: [...] },
  };
}
```

### Client Consumes

```typescript
// Client uses same shared type
import { BootstrapPayload } from "@restart/shared";

function handleBootstrap(payload: BootstrapPayload) {
  // TypeScript ensures we handle all cases
  switch (payload.page.kind) {
    case "home": /* ... */
    case "todos": /* ... */
    case "error": /* ... */
  }
}
```

**Benefit:** If you change the type in `shared`, TypeScript catches mismatches in both server and client.

---

## Client-Side Navigation

After initial load, navigation doesn't need full SSR. Instead:

```
User clicks link to /about
         │
         ▼
┌─────────────────────────┐
│ React Router intercepts │
│ (no page reload)        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Fetch /api/bootstrap    │
│ ?path=/about            │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Apply new bootstrap     │
│ to Redux store          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Components re-render    │
│ with new data           │
└─────────────────────────┘
```

### Implementation

```typescript
// In a route change handler
async function handleNavigation(newPath: string) {
  // Fetch bootstrap for new route
  const response = await fetch(`/api/bootstrap?path=${newPath}`);
  const bootstrap = await response.json();

  // Apply to store
  applyBootstrapToStore(bootstrap, dispatch);

  // React re-renders with new data
}
```

---

## Common Issues

### 1. "Cannot read property of null"

**Symptom:** Client crashes reading state

**Cause:** State wasn't properly injected or parsed

**Debug:**
```typescript
console.log("Raw state:", window.__PRELOADED_STATE__);
const state = readPreloadedStateFromWindow();
console.log("Parsed state:", state);
```

### 2. State Mismatch Between Server and Client

**Symptom:** Hydration warnings, incorrect data shown

**Cause:** State changed between server render and client read

**Fix:** Ensure state is deterministic. Avoid:
- Random values
- Current timestamps
- Async operations that might return different data

### 3. Large State Causing Slow Page Load

**Symptom:** HTML is huge, page loads slowly

**Cause:** Too much data in preloaded state

**Fix:**
- Only include data needed for initial render
- Paginate large lists
- Defer non-critical data to client-side fetching

```typescript
// Instead of 1000 todos
const bootstrap = {
  todos: allTodos.slice(0, 20),  // First page only
  totalCount: allTodos.length,  // Client knows there's more
};
```

### 4. TypeScript Errors with Window Globals

**Symptom:** "Property does not exist on type Window"

**Fix:** Declare the globals:

```typescript
// In a .d.ts file
declare global {
  interface Window {
    __BOOTSTRAP__?: unknown;
    __PRELOADED_STATE__?: unknown;
  }
}
```

---

## Alternative Patterns

### 1. Props Instead of Globals

Pass state as a data attribute:

```html
<div id="root" data-state='{"message":"Hello"}'></div>
```

```typescript
const stateAttr = document.getElementById("root")?.dataset.state;
const state = stateAttr ? JSON.parse(stateAttr) : null;
```

**Trade-off:** Cleaner than globals, but limited by attribute size.

### 2. Separate JSON Endpoint

Fetch state from an API instead of embedding:

```html
<div id="root" data-state-url="/api/initial-state"></div>
```

```typescript
const url = document.getElementById("root")?.dataset.stateUrl;
const state = await fetch(url).then(r => r.json());
```

**Trade-off:** Extra HTTP request, but HTML is smaller.

### 3. Streaming State

With React 18 streaming, inject state as it becomes available:

```html
<!-- First chunk -->
<div id="root">
  <header>...</header>

<!-- Later chunk -->
<script>window.__BOOTSTRAP__.todos = [...];</script>
  <main>...</main>
</div>
```

**Trade-off:** Complex to implement, but faster perceived load.

---

## Summary

The isomorphic state transfer pattern:

1. **Server fetches** data from APIs
2. **Server creates** Redux store with data
3. **Server renders** React to HTML
4. **Server serializes** state to JSON in HTML
5. **Client parses** JSON from window globals
6. **Client creates** Redux store with same state
7. **Client hydrates** React (attaches to existing HTML)
8. **Result:** Fast initial load, no refetch needed

This pattern is the foundation of modern SSR frameworks like Next.js and Remix.
