# Hot Module Replacement (HMR)

This document explains how Hot Module Replacement works for rapid development.

## Overview

**Hot Module Replacement (HMR)** allows you to update code without a full page refresh. When you save a file:

```
1. You edit a file
        │
        ▼
2. Webpack detects change
        │
        ▼
3. Webpack compiles only the changed module
        │
        ▼
4. Webpack sends update to browser via WebSocket
        │
        ▼
5. Browser applies update without losing state
```

### Without HMR vs With HMR

| Without HMR | With HMR |
|-------------|----------|
| Full page reload | Partial update |
| Lose all state | Preserve state |
| Re-fetch all data | Keep cached data |
| Reset scroll position | Stay where you are |
| 2-5 second feedback loop | ~100ms feedback loop |

---

## Client-Side HMR (Webpack)

**File:** `apps/web/webpack.config.cjs`

```javascript
devServer: {
  hot: true,  // Enable HMR
  // ...
}
```

That's it! Webpack Dev Server handles the rest:

1. Injects HMR runtime into the bundle
2. Opens WebSocket connection to dev server
3. Receives module updates
4. Applies updates via module replacement

### How Updates Are Applied

When you change a React component:

```
1. webpack compiles new version of TodosPage.tsx
2. webpack sends update over WebSocket
3. HMR runtime receives the update
4. React re-renders with new component
5. State is preserved (if using hooks properly)
```

### CSS Hot Reload

In development, CSS uses `style-loader`:

```javascript
{
  test: /\.css$/,
  use: [
    "style-loader",  // Injects CSS into DOM
    "css-loader",
  ],
}
```

`style-loader` supports HMR natively. When you change CSS:

1. New styles are injected
2. Old styles are removed
3. No JavaScript reload needed

In production, we use `MiniCssExtractPlugin` instead (extracts CSS to files).

---

## Server-Side Hot Reload (tsx watch)

**File:** `apps/bff/package.json`

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts"
  }
}
```

`tsx watch` is different from browser HMR:

| Browser HMR | Server tsx watch |
|-------------|------------------|
| Updates modules in place | Restarts entire server |
| Preserves state | State is lost |
| Near-instant | ~1 second |

### Why Not True Server HMR?

Node.js doesn't have HMR built-in. While solutions exist (like `hot-module-replacement` package), they're complex and can cause issues with:

- Database connections
- Socket connections
- Cached data
- Middleware state

For development, a fast restart is usually good enough.

### Improving Server Restart Speed

```javascript
// Only import what you need at startup
import express from "express";

// Lazy load rarely-used modules
async function handleRareCase() {
  const { rareThing } = await import("./rare-thing.js");
  return rareThing();
}
```

---

## Manifest Hot Reload

The BFF reads the webpack manifest to know asset filenames:

**File:** `apps/bff/src/server/manifest.ts`

```typescript
const CACHE_TTL_MS =
  process.env.NODE_ENV === "production"
    ? Infinity    // Never expire in production
    : 5000;       // Refresh every 5s in development

let cached: { manifest: AssetManifest; timestamp: number } | null = null;

export async function readManifest(staticDir: string): Promise<AssetManifest> {
  const now = Date.now();

  // Return cached if fresh
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.manifest;
  }

  // Read fresh manifest
  const manifest = await fs.readFile(
    path.join(staticDir, "manifest.json"),
    "utf-8"
  );

  cached = { manifest: JSON.parse(manifest), timestamp: now };
  return cached.manifest;
}
```

**Why cache with TTL?**

- Reading files is slow
- But we need fresh data when webpack rebuilds
- 5-second TTL balances speed and freshness

---

## React State Preservation

HMR preserves component state when possible. This works best with:

### Functional Components with Hooks

```typescript
function Counter() {
  const [count, setCount] = useState(0);
  // count is preserved across HMR updates!
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### What Breaks State Preservation

**1. Changing hook order:**
```typescript
// Before
function Component() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(2);
}

// After - state is lost!
function Component() {
  const [b, setB] = useState(2);  // Order changed
  const [a, setA] = useState(1);
}
```

**2. Adding/removing hooks:**
```typescript
// Before
function Component() {
  const [a, setA] = useState(1);
}

// After - state is lost!
function Component() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(2);  // New hook
}
```

**3. Moving component to different file:**
```typescript
// Components are identified by file + name
// Moving breaks identity → state lost
```

### React Fast Refresh

React's official HMR solution is **Fast Refresh**. It:

- Preserves state in function components
- Automatically remounts if state can't be preserved
- Shows errors as overlay, not crash

Webpack uses `react-refresh-webpack-plugin` for this (not configured in this project, but recommended):

```javascript
const ReactRefreshPlugin = require("@pmmmwh/react-refresh-webpack-plugin");

module.exports = {
  plugins: [
    !isProduction && new ReactRefreshPlugin(),
  ].filter(Boolean),
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        use: [
          {
            loader: "babel-loader",
            options: {
              plugins: [
                !isProduction && require.resolve("react-refresh/babel"),
              ].filter(Boolean),
            },
          },
        ],
      },
    ],
  },
};
```

---

## Redux State During HMR

Redux state lives in the store, outside React. It survives HMR naturally:

```typescript
// Store is created once at app startup
const { store } = makeStore({ apiBaseUrl: "/api" });

// Components are hot-reloaded
// But they read from the same store
function TodoList() {
  const todos = useSelector(state => state.todos);
  // todos persists across HMR!
}
```

### Store Replacement

If you change reducer logic, you might want to replace the reducer:

```typescript
if (module.hot) {
  module.hot.accept("./reducers", () => {
    store.replaceReducer(rootReducer);
  });
}
```

This is advanced usage and usually not needed with RTK.

---

## Development Workflow Tips

### 1. Use Two Terminals

```bash
# Terminal 1: BFF server
npm run dev:bff

# Terminal 2: Webpack dev server
npm run dev:web
```

Or use the combined command:
```bash
npm run dev  # Runs both in parallel
```

### 2. Check the Console

HMR logs updates:
```
[HMR] Updated modules:
[HMR]  - ./src/pages/TodosPage.tsx
[HMR] App is up to date.
```

Errors show clearly:
```
[HMR] Failed to apply update
[HMR] Full reload required
```

### 3. Force Full Reload

Sometimes you want a clean slate:
- **Cmd/Ctrl + Shift + R** - Hard reload (clears cache)
- Or disable cache in DevTools Network tab

### 4. WebSocket Connection

HMR uses WebSocket. If updates stop:
1. Check browser console for WebSocket errors
2. Check if dev server is running
3. Try refreshing the page

---

## Common Issues

### 1. "HMR update failed"

**Symptom:** Console shows error, page doesn't update

**Causes:**
- Syntax error in code
- Module not accepting updates
- WebSocket disconnected

**Fix:** Usually fixing the code and saving again works. If not, refresh the page.

### 2. State Lost on Every Change

**Symptom:** Form inputs clear, counters reset

**Causes:**
- Component identity changed (renamed, moved)
- Hook order changed
- Parent component remounting

**Debug:**
```typescript
// Add to component to see when it mounts
useEffect(() => {
  console.log("Component mounted");
  return () => console.log("Component unmounted");
}, []);
```

### 3. Styles Not Updating

**Symptom:** CSS changes don't appear

**Causes:**
- Using `MiniCssExtractPlugin` in development
- CSS cached by browser
- Wrong loader configuration

**Fix:** Ensure `style-loader` is used in development:
```javascript
use: [
  isProduction ? MiniCssExtractPlugin.loader : "style-loader",
  "css-loader",
]
```

### 4. Old Code Still Running

**Symptom:** Fixed bug but it still appears

**Causes:**
- Module cached somewhere
- Service worker caching
- Multiple tabs open with old code

**Fix:**
1. Hard refresh (Cmd/Ctrl + Shift + R)
2. Clear site data in DevTools
3. Close other tabs

---

## Performance Tips

### 1. Exclude node_modules from Watching

```javascript
watchOptions: {
  ignored: /node_modules/,
}
```

### 2. Use Polling Only If Needed

File watching uses OS events by default (fast). Polling is slower but more compatible:

```javascript
watchOptions: {
  poll: 1000,  // Only if file events don't work
}
```

### 3. Limit Compilation Scope

For large apps, compile only what changed:

```javascript
module.exports = {
  cache: {
    type: "filesystem",  // Cache to disk
  },
};
```

---

## Alternative Approaches

### 1. Vite

Vite uses native ES modules for instant HMR:

```javascript
// vite.config.js
export default {
  server: {
    hmr: true,
  },
};
```

**Trade-off:** Faster HMR, but different bundling model.

### 2. Parcel

Zero-config with built-in HMR:

```bash
parcel src/index.html
# HMR just works
```

**Trade-off:** Less configuration, but less control.

### 3. Browser Sync

For simpler projects, sync changes across browsers:

```javascript
const browserSync = require("browser-sync");
browserSync({ server: "./dist", files: ["./dist/**/*"] });
```

**Trade-off:** Simpler, but full page reloads only.

---

## Summary

HMR significantly improves development experience:

| Aspect | This Project |
|--------|--------------|
| Client HMR | Webpack Dev Server with `hot: true` |
| CSS HMR | `style-loader` in development |
| Server Reload | `tsx watch` (fast restart) |
| Manifest | 5-second cache in development |
| State | Redux preserves naturally, React requires care |

For even better React HMR, consider adding `react-refresh-webpack-plugin`.
