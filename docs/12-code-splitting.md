# Code Splitting

This document explains code splitting strategies and why this project uses certain approaches.

## Overview

**Code splitting** divides your JavaScript into smaller chunks that load on demand. This improves initial page load by only loading what's needed.

```
Without Code Splitting:
┌─────────────────────────────────────────────────────────────────┐
│                        app.js (500KB)                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  React  │ │  Redux  │ │  Home   │ │  Todos  │ │  About  │   │
│  │  100KB  │ │  50KB   │ │  50KB   │ │  200KB  │ │  100KB  │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────────────────────────────┘
User loads page → Downloads 500KB → Then sees content

With Code Splitting:
┌───────────────────────────────┐
│     app.js (150KB)            │   ← Loads immediately
│  ┌─────────┐ ┌─────────┐     │
│  │  React  │ │  Redux  │     │
│  └─────────┘ └─────────┘     │
└───────────────────────────────┘

┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ home.js     │ │ todos.js    │ │ about.js    │   ← Load on demand
│   50KB      │ │   200KB     │ │   100KB     │
└─────────────┘ └─────────────┘ └─────────────┘

User loads page → Downloads 150KB → Sees content fast!
User navigates to /todos → Downloads 200KB → Shows todos
```

---

## Current Implementation

This project **does not use route-based code splitting**. Here's the current setup:

**File:** `packages/ui/src/App.tsx`

```typescript
// Direct imports (no lazy loading)
import { Homepage } from "./pages/Homepage.js";
import { TodosPage } from "./pages/TodosPage.js";
import { About } from "./pages/About.js";
import { NotFound } from "./pages/NotFound.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/about" element={<About />} />
      <Route path="/todos" element={<TodosPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

### Why No Lazy Loading?

**The Problem:** `React.lazy()` requires `<Suspense>`, which doesn't work with `renderToString()`:

```typescript
// This DOESN'T work with SSR
const TodosPage = React.lazy(() => import("./pages/TodosPage"));

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Routes>
        <Route path="/todos" element={<TodosPage />} />
      </Routes>
    </Suspense>
  );
}

// On server:
renderToString(<App />);
// Result: "<p>Loading...</p>" - NOT the actual content!
```

**The Trade-off:**

| Without Lazy Loading | With Lazy Loading |
|---------------------|-------------------|
| Larger initial bundle | Smaller initial bundle |
| Full content in SSR | Shows loading states in SSR |
| Simpler implementation | Requires SSR-aware setup |

For this project, full SSR content was prioritized over bundle size.

---

## Webpack's Automatic Splitting

Even without explicit code splitting, Webpack optimizes:

**File:** `apps/web/webpack.config.cjs`

```javascript
output: {
  filename: "assets/[name].[contenthash].js",
  chunkFilename: "assets/[name].[contenthash].js",
},
optimization: {
  splitChunks: {
    chunks: "all",  // Split shared modules
  },
},
```

### What Webpack Splits Automatically

1. **Vendor chunks** - Large libraries (React, Redux) may be split
2. **Shared modules** - Code used by multiple entry points
3. **Dynamic imports** - Any `import()` expression

### Current Bundle Analysis

```bash
ANALYZE=true npm run build -w @restart/web
```

This opens a visualization showing:
- What's in each chunk
- Relative sizes
- Opportunities for optimization

---

## Code Splitting Strategies

### 1. Route-Based Splitting (Common)

Load page components on demand:

```typescript
// ❌ Doesn't work with SSR renderToString
const TodosPage = React.lazy(() => import("./pages/TodosPage"));
```

### 2. Component-Based Splitting

Load heavy components on demand:

```typescript
function Dashboard() {
  const [showChart, setShowChart] = useState(false);

  // Chart library is heavy - load only when needed
  const Chart = React.lazy(() => import("./Chart"));

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && (
        <Suspense fallback={<p>Loading chart...</p>}>
          <Chart data={data} />
        </Suspense>
      )}
    </div>
  );
}
```

This works even with SSR because:
- Initial render doesn't include the lazy component
- User interaction triggers the load
- SSR renders the button, client loads the chart

### 3. Prefetching

Tell the browser to load chunks in advance:

```typescript
// Webpack magic comment for prefetch
const TodosPage = React.lazy(() =>
  import(/* webpackPrefetch: true */ "./pages/TodosPage")
);
```

Browser loads `TodosPage` in idle time, so it's ready when needed.

### 4. Preloading

Load immediately but don't block:

```typescript
const TodosPage = React.lazy(() =>
  import(/* webpackPreload: true */ "./pages/TodosPage")
);
```

---

## SSR-Compatible Code Splitting

To have both SSR and code splitting, you need special handling:

### Option 1: @loadable/component

```typescript
import loadable from "@loadable/component";

const TodosPage = loadable(() => import("./pages/TodosPage"), {
  fallback: <p>Loading...</p>,
});

// Works with SSR because loadable tracks what was loaded
// and includes those chunks in the HTML
```

Server setup:
```typescript
import { ChunkExtractor } from "@loadable/server";

const extractor = new ChunkExtractor({ statsFile });
const app = extractor.collectChunks(<App />);
const html = renderToString(app);
const scripts = extractor.getScriptTags();  // Includes needed chunks
```

### Option 2: React 18 Streaming

React 18's `renderToPipeableStream` works with Suspense:

```typescript
import { renderToPipeableStream } from "react-dom/server";

const stream = renderToPipeableStream(<App />, {
  bootstrapScripts: ["/assets/app.js"],
  onShellReady() {
    res.setHeader("Content-Type", "text/html");
    stream.pipe(res);
  },
});
```

The shell (layout) streams first, then content fills in as Suspense boundaries resolve.

### Option 3: Framework Support

Next.js and Remix handle SSR code splitting automatically:

```typescript
// Next.js - automatic code splitting per page
// pages/todos.tsx just works

// Remix - loader-based splitting
export async function loader() {
  return getTodos();
}
```

---

## When to Add Code Splitting

### Signs You Need It

1. **Initial bundle > 200KB** - Users wait too long
2. **Unused code on initial load** - Pages user might never visit
3. **Heavy libraries** - Chart libraries, editors, etc.
4. **Mobile users** - Slow networks make large bundles painful

### This Project's Bundle

```
WARNING in entrypoint size limit: The following entrypoint(s) combined
asset size exceeds the recommended limit (244 KiB). This can impact
web performance.
Entrypoints:
  app (300 KiB)
      assets/app.css
      assets/app.js
```

At 300KB, this project is slightly above the recommended limit. Options:

1. **Accept it** - For this learning project, simplicity wins
2. **Add route splitting** - Would reduce initial load
3. **Tree shake** - Remove unused code
4. **Lazy load heavy features** - If adding charts, editors, etc.

---

## Optimization Techniques

### 1. Tree Shaking

Webpack removes unused exports:

```typescript
// math.js
export function add(a, b) { return a + b; }
export function subtract(a, b) { return a - b; }

// app.js
import { add } from "./math";  // subtract is removed from bundle
```

Requirements:
- Use ES modules (`import`/`export`)
- Set `sideEffects: false` in package.json if safe

### 2. External Dependencies

Don't bundle libraries loaded from CDN:

```javascript
externals: {
  react: "React",
  "react-dom": "ReactDOM",
},
```

Then load from CDN:
```html
<script src="https://unpkg.com/react/umd/react.production.min.js"></script>
```

### 3. Compression

Enable gzip/brotli compression:

```javascript
// In Express
import compression from "compression";
app.use(compression());
```

300KB bundle → ~80KB compressed.

### 4. Analyze and Remove

Find what's taking space:

```bash
ANALYZE=true npm run build -w @restart/web
```

Common culprits:
- Moment.js locales (use date-fns instead)
- Lodash (import specific functions)
- Duplicate dependencies

---

## Implementation Guide

If you want to add route-based code splitting to this project:

### Step 1: Install loadable

```bash
npm install @loadable/component @loadable/server
npm install -D @loadable/babel-plugin @loadable/webpack-plugin
```

### Step 2: Update Webpack

```javascript
const LoadablePlugin = require("@loadable/webpack-plugin");

plugins: [
  new LoadablePlugin(),
],
```

### Step 3: Update Routes

```typescript
import loadable from "@loadable/component";

const Homepage = loadable(() => import("./pages/Homepage"));
const TodosPage = loadable(() => import("./pages/TodosPage"));
const About = loadable(() => import("./pages/About"));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/about" element={<About />} />
      <Route path="/todos" element={<TodosPage />} />
    </Routes>
  );
}
```

### Step 4: Update SSR

```typescript
import { ChunkExtractor, ChunkExtractorManager } from "@loadable/server";

export function renderHtml(/* ... */) {
  const extractor = new ChunkExtractor({ statsFile: "loadable-stats.json" });

  const appHtml = renderToString(
    <ChunkExtractorManager extractor={extractor}>
      <Provider store={store}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </Provider>
    </ChunkExtractorManager>
  );

  const scriptTags = extractor.getScriptTags();
  const styleTags = extractor.getStyleTags();

  return `
    <html>
      <head>${styleTags}</head>
      <body>
        <div id="root">${appHtml}</div>
        ${scriptTags}
      </body>
    </html>
  `;
}
```

### Step 5: Update Client

```typescript
import { loadableReady } from "@loadable/component";

loadableReady(() => {
  hydrateRoot(document.getElementById("root")!, <App />);
});
```

---

## Summary

| Aspect | This Project | Alternative |
|--------|--------------|-------------|
| Route splitting | No (SSR simplicity) | Yes with @loadable |
| Bundle size | ~300KB | Could be smaller |
| SSR content | Full | Could show loading states |
| Complexity | Low | Higher with splitting |

**Recommendation:** For learning, the current approach is fine. For production with many routes and heavy features, add `@loadable/component` or switch to a framework like Next.js that handles this automatically.

---

## Further Reading

- [Webpack Code Splitting](https://webpack.js.org/guides/code-splitting/)
- [React.lazy Documentation](https://react.dev/reference/react/lazy)
- [@loadable/component](https://loadable-components.com/)
- [React 18 Streaming SSR](https://react.dev/reference/react-dom/server/renderToPipeableStream)
