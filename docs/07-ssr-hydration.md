# Server-Side Rendering & Hydration

This document explains how the application renders React on the server and "hydrates" it on the client.

## Overview

**Server-Side Rendering (SSR)** means generating HTML on the server instead of in the browser. The flow is:

```
1. Browser requests /todos
          │
          ▼
2. Server receives request
          │
          ▼
3. Server fetches data needed for page
          │
          ▼
4. Server renders React to HTML string
          │
          ▼
5. Server sends HTML to browser
          │
          ▼
6. Browser displays HTML (fast!)
          │
          ▼
7. Browser downloads JavaScript
          │
          ▼
8. React "hydrates" - attaches to existing HTML
          │
          ▼
9. Page is now interactive
```

## Why SSR?

| Without SSR | With SSR |
|-------------|----------|
| Browser gets empty HTML | Browser gets full HTML |
| User sees loading spinner | User sees content immediately |
| SEO bots see nothing | SEO bots see content |
| Slow perceived load | Fast perceived load |

**The trade-off:** Server does more work, but users see content faster.

---

## SSR Implementation

### Request Handler

**File:** `apps/bff/src/http/ssrHandler.ts`

```typescript
export function createSsrHandler(staticDir: string) {
  return async (req: Request, res: Response) => {
    // 1. Build context from request
    const context = createRequestContext(req);

    // 2. Get data for this page
    const bootstrap = await getBootstrapPayload(context);

    // 3. Read asset manifest
    const assets = await resolveAssets(staticDir);

    // 4. Render React to HTML
    const html = renderHtml(bootstrap, assets, req.originalUrl);

    // 5. Send response
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  };
}
```

### React Rendering

**File:** `apps/bff/src/server/ssr/render.tsx`

```typescript
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Provider } from "react-redux";
import { App, makeStore, applyBootstrapToStore } from "@restart/ui";

export function renderHtml(
  bootstrap: BootstrapPayload,
  assets: ResolvedAssets,
  requestUrl: string
): string {
  // 1. Create Redux store for this request
  const { store } = makeStore({ apiBaseUrl: "/api" });

  // 2. Apply bootstrap data to store
  applyBootstrapToStore(bootstrap, store.dispatch);

  // 3. Render React components to HTML string
  const appHtml = renderToString(
    <Provider store={store}>
      <StaticRouter location={requestUrl}>
        <App />
      </StaticRouter>
    </Provider>
  );

  // 4. Get final state for client
  const preloadedState = store.getState();

  // 5. Build full HTML document
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restart App</title>
  <link rel="stylesheet" href="${assets.css}">
</head>
<body>
  <div id="root">${appHtml}</div>
  <script>
    window.__BOOTSTRAP__ = ${escapeJsonForHtml(bootstrap)};
    window.__PRELOADED_STATE__ = ${escapeJsonForHtml(preloadedState)};
  </script>
  <script src="${assets.js}"></script>
</body>
</html>`;
}
```

### Key Concepts

**`renderToString`** - Converts React elements to an HTML string:
```typescript
renderToString(<div>Hello</div>)
// Returns: "<div>Hello</div>"
```

**`StaticRouter`** - A router for server environments. Takes the URL as a prop since there's no browser history:
```typescript
<StaticRouter location="/todos">
  <App />  {/* Routes will match /todos */}
</StaticRouter>
```

**State injection** - The server injects data into the HTML so the client doesn't need to refetch:
```html
<script>
  window.__BOOTSTRAP__ = {"route":"/todos","greeting":"Hello!",...};
  window.__PRELOADED_STATE__ = {"app":{"message":"Hello!"},...};
</script>
```

---

## Hydration

**Hydration** is when React "takes over" server-rendered HTML. Instead of creating new DOM elements, React attaches event listeners to existing ones.

### Client Entry Point

**File:** `apps/web/src/main.tsx`

```typescript
import { hydrateRoot, createRoot } from "react-dom/client";
import { readPreloadedStateFromWindow } from "./bootstrap.js";

async function main() {
  const rootEl = document.getElementById("root")!;

  // 1. Read server-injected state
  const preloadedState = readPreloadedStateFromWindow();

  // 2. Create store with that state
  const { store } = makeStore({
    apiBaseUrl: "/api",
    preloadedState,
    api: browserApi,
  });

  // 3. Build the React tree
  const app = (
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  );

  // 4. Hydrate if server-rendered, otherwise render fresh
  const hasServerMarkup = rootEl.childNodes.length > 0;

  if (hasServerMarkup) {
    hydrateRoot(rootEl, app);  // Attach to existing HTML
  } else {
    createRoot(rootEl).render(app);  // Create new HTML
  }
}

main();
```

### hydrateRoot vs createRoot

| `createRoot` | `hydrateRoot` |
|--------------|---------------|
| Creates new DOM elements | Attaches to existing DOM |
| Ignores existing HTML | Expects HTML to match |
| For client-only apps | For SSR apps |

```typescript
// Client-only rendering
const root = createRoot(container);
root.render(<App />);

// Hydration (for SSR)
hydrateRoot(container, <App />);  // container already has HTML
```

---

## The Hydration Contract

For hydration to work, **server and client must render identical HTML**.

### What Must Match

```
Server renders:           Client expects:
─────────────────────────────────────────
<div id="root">           <div id="root">
  <h1>Hello, Alex!</h1>     <h1>Hello, Alex!</h1>  ✓ Match
  <ul>                      <ul>
    <li>Todo 1</li>           <li>Todo 1</li>     ✓ Match
    <li>Todo 2</li>           <li>Todo 2</li>     ✓ Match
  </ul>                     </ul>
</div>                    </div>
```

### What Breaks Hydration

```typescript
// BAD: Different on server vs client
function Greeting() {
  // Date.now() is different on server and client!
  return <p>Time: {Date.now()}</p>;
}

// BAD: Browser-only APIs
function WindowSize() {
  // window doesn't exist on server!
  return <p>Width: {window.innerWidth}</p>;
}

// BAD: Random values
function RandomGreeting() {
  const greetings = ["Hi", "Hello", "Hey"];
  // Different random value each render!
  return <p>{greetings[Math.floor(Math.random() * 3)]}</p>;
}
```

### How to Handle Differences

```typescript
// GOOD: Use effects for client-only values
function WindowSize() {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    // Only runs on client after hydration
    setWidth(window.innerWidth);
  }, []);

  // Render same thing on server and initial client
  if (width === null) return <p>Loading...</p>;
  return <p>Width: {width}</p>;
}

// GOOD: Use suppressHydrationWarning for intentional differences
function Timestamp() {
  return (
    <time suppressHydrationWarning>
      {new Date().toISOString()}
    </time>
  );
}
```

---

## State Transfer

The server passes state to the client via `window` globals:

### Bootstrap Payload

Contains page-specific data:

```typescript
window.__BOOTSTRAP__ = {
  route: "/todos",
  greeting: "Hello, Alex!",
  page: {
    kind: "todos",
    todos: [
      { id: 1, title: "Learn SSR", completed: false },
      { id: 2, title: "Build app", completed: true },
    ],
  },
};
```

### Preloaded State

Contains the entire Redux store state:

```typescript
window.__PRELOADED_STATE__ = {
  app: {
    message: "Hello, Alex!",
    bootstrap: { /* same as __BOOTSTRAP__ */ },
  },
  api: {
    queries: {},
    mutations: {},
    // RTK Query cache data
  },
};
```

### Reading State on Client

**File:** `apps/web/src/bootstrap.ts`

```typescript
export function readPreloadedStateFromWindow(): Partial<RootState> | null {
  const raw = window.__PRELOADED_STATE__;
  if (!raw) return null;

  // Delete to prevent re-use and save memory
  delete window.__PRELOADED_STATE__;

  // Validate shape
  if (typeof raw !== "object" || raw === null) return null;
  if (!("app" in raw)) return null;

  return raw as Partial<RootState>;
}
```

**Why delete after reading?**
1. Prevents accidental re-use
2. Frees memory (state can be large)
3. Security - don't keep sensitive data in global

---

## XSS Prevention

Injecting JSON into HTML is dangerous. Malicious data could escape the script:

```html
<!-- If bootstrap contains: </script><script>alert('XSS') -->
<script>
  window.__BOOTSTRAP__ = {"message":"</script><script>alert('XSS')"};
</script>
```

### The Fix

**File:** `apps/bff/src/server/ssr/render.tsx`

```typescript
function escapeJsonForHtml(json: unknown): string {
  return JSON.stringify(json)
    .replace(/</g, "\\u003c")    // Escape <
    .replace(/>/g, "\\u003e")    // Escape >
    .replace(/&/g, "\\u0026")    // Escape &
    .replace(/'/g, "\\u0027")    // Escape '
    .replace(/"/g, "\\u0022");   // Escape "
}
```

Now malicious content becomes harmless:
```html
<script>
  window.__BOOTSTRAP__ = {"message":"\u003c/script\u003e\u003cscript\u003ealert('XSS')"};
</script>
<!-- JSON.parse will convert \u003c back to < safely -->
```

---

## SSR Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        SERVER FLOW                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Receive Request                                               │
│     GET /todos                                                    │
│           │                                                       │
│           ▼                                                       │
│  2. Create Context                                                │
│     { requestId, userId, path: "/todos" }                         │
│           │                                                       │
│           ▼                                                       │
│  3. Fetch Bootstrap Data                                          │
│     ┌─────────────────────────────────────────┐                  │
│     │ Check cache → Miss → Fetch from APIs    │                  │
│     │ → Transform data → Cache result         │                  │
│     └─────────────────────────────────────────┘                  │
│           │                                                       │
│           ▼                                                       │
│  4. Create Redux Store                                            │
│     makeStore({ apiBaseUrl: "/api" })                             │
│           │                                                       │
│           ▼                                                       │
│  5. Apply Bootstrap to Store                                      │
│     dispatch(setBootstrap(data))                                  │
│     dispatch(setMessage(greeting))                                │
│           │                                                       │
│           ▼                                                       │
│  6. Render React to String                                        │
│     renderToString(<Provider><StaticRouter><App/></...>)          │
│           │                                                       │
│           ▼                                                       │
│  7. Build HTML Document                                           │
│     Insert: appHtml, CSS link, JS script, state scripts           │
│           │                                                       │
│           ▼                                                       │
│  8. Send Response                                                 │
│     res.send(html)                                                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                               │
                               │ HTML Response
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT FLOW                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Receive HTML                                                  │
│     Browser renders immediately (fast!)                           │
│           │                                                       │
│           ▼                                                       │
│  2. Download JavaScript                                           │
│     Browser fetches app.js                                        │
│           │                                                       │
│           ▼                                                       │
│  3. Execute JavaScript                                            │
│     main() starts running                                         │
│           │                                                       │
│           ▼                                                       │
│  4. Read Preloaded State                                          │
│     readPreloadedStateFromWindow()                                │
│           │                                                       │
│           ▼                                                       │
│  5. Create Store with State                                       │
│     makeStore({ preloadedState })                                 │
│           │                                                       │
│           ▼                                                       │
│  6. Hydrate React                                                 │
│     hydrateRoot(root, <App/>)                                     │
│     React attaches listeners to existing DOM                      │
│           │                                                       │
│           ▼                                                       │
│  7. Page is Interactive                                           │
│     User can click, type, navigate                                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Common Issues

### 1. Hydration Mismatch Warning

**Symptom:** Console shows "Text content did not match" or "Hydration failed"

**Causes:**
- Server and client render different content
- Using browser APIs during render
- Date/time differences

**Debugging:**
```typescript
// Add this temporarily to see what's different
if (typeof window !== "undefined") {
  console.log("Client render:", someValue);
} else {
  console.log("Server render:", someValue);
}
```

### 2. "window is not defined"

**Symptom:** Server crashes with ReferenceError

**Cause:** Using browser globals during SSR

**Fix:**
```typescript
// Check environment
if (typeof window !== "undefined") {
  // Browser-only code
}

// Or use useEffect (only runs on client)
useEffect(() => {
  // Browser-only code
}, []);
```

### 3. Styles Flash/Change After Load

**Symptom:** Page looks different for a moment after load

**Cause:** CSS loaded differently on server vs client

**Fix:** Ensure CSS is:
- In a `<link>` tag in the HTML head
- Or extracted with MiniCssExtractPlugin
- Not dynamically generated with different values

### 4. State Not Available on Client

**Symptom:** `preloadedState` is null/undefined

**Causes:**
- Script tags in wrong order (state must be before app.js)
- State script has syntax error
- `window.__PRELOADED_STATE__` typo

**Fix:** Check the HTML source:
```html
<!-- This order is required: -->
<script>window.__PRELOADED_STATE__ = {...};</script>
<script src="/assets/app.js"></script>
```

---

## Performance Considerations

### Streaming SSR

React 18 supports streaming with `renderToPipeableStream`:

```typescript
import { renderToPipeableStream } from "react-dom/server";

const stream = renderToPipeableStream(<App />, {
  onShellReady() {
    res.setHeader("Content-Type", "text/html");
    stream.pipe(res);
  },
});
```

**Benefits:** Browser can start rendering before full HTML is ready.

**This project uses:** `renderToString` for simplicity. Consider streaming for large pages.

### Caching SSR Results

```typescript
// Cache HTML for anonymous users
const cachedHtml = htmlCache.get(cacheKey);
if (cachedHtml) {
  return res.send(cachedHtml);
}

const html = renderHtml(/* ... */);
htmlCache.set(cacheKey, html);
res.send(html);
```

**This project caches:** Bootstrap data, not full HTML. This allows personalized greetings while caching expensive API calls.

---

## Alternative Approaches

### 1. Static Site Generation (SSG)

Pre-render at build time instead of request time:

```typescript
// Build time
const html = renderHtml(data);
fs.writeFileSync("dist/todos.html", html);

// Request time - just serve static file
app.use(express.static("dist"));
```

**Trade-off:** Faster responses, but content can't be dynamic.

### 2. Incremental Static Regeneration (ISR)

Pre-render but refresh periodically:

```typescript
// Serve static, but regenerate after 60 seconds
res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
```

**Trade-off:** Balance between static speed and dynamic content.

### 3. Client-Side Only

Skip SSR entirely:

```html
<div id="root"></div>
<script src="/app.js"></script>
<!-- App renders everything in browser -->
```

**Trade-off:** Simpler, but slower initial load and poor SEO.
