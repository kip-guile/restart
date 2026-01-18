# Client-Side Routing

This document explains how navigation works in the application using React Router.

## Overview

The application uses **React Router v6** for client-side routing. This means:

1. The browser URL changes when you navigate
2. The page content changes without a full page reload
3. The server doesn't need to serve different HTML for each route

```
User clicks link
       │
       ▼
┌─────────────────┐
│  React Router   │ ─── Matches URL to route
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Render Page    │ ─── Shows the matched component
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update Browser  │ ─── Changes URL bar (no page reload)
└─────────────────┘
```

## Route Configuration

**File:** `packages/ui/src/App.tsx`

```tsx
import { Routes, Route } from "react-router-dom";
import { Homepage } from "./pages/Homepage.js";
import { TodosPage } from "./pages/TodosPage.js";
import { About } from "./pages/About.js";
import { NotFound } from "./pages/NotFound.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/about" element={<About />} />
        <Route path="/todos" element={<TodosPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
```

### Understanding the Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `Homepage` | Home page, shows greeting |
| `/about` | `About` | Static about page |
| `/todos` | `TodosPage` | Dynamic page with API data |
| `*` | `NotFound` | Catch-all for unknown routes |

### The `*` Wildcard Route

```tsx
<Route path="*" element={<NotFound />} />
```

This matches any URL that doesn't match the routes above. Must be listed last.

**Without it:** Users see a blank page for invalid URLs.

---

## Router Types

React Router provides different router components for different contexts:

### BrowserRouter (Client)

**File:** `apps/web/src/main.tsx`

```tsx
import { BrowserRouter } from "react-router-dom";

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>
);
```

**What it does:**
- Uses the browser's History API (`pushState`, `popstate`)
- URLs look like: `https://example.com/about`
- Requires server configuration to work

**Server requirement:** The server must return `index.html` for all routes. Otherwise, refreshing `/about` returns 404.

### StaticRouter (Server)

**File:** `apps/bff/src/server/ssr/render.tsx`

```tsx
import { StaticRouter } from "react-router-dom/server";

export function renderHtml(/* ... */, requestUrl: string) {
  const appHtml = renderToString(
    <Provider store={store}>
      <StaticRouter location={requestUrl}>
        <App />
      </StaticRouter>
    </Provider>
  );
  // ...
}
```

**What it does:**
- Doesn't interact with browser (there is none on server)
- Takes the URL as a prop (`location`)
- Renders the matching route to HTML

**Why needed:** On the server, there's no browser history. We pass the requested URL directly.

---

## Navigation Patterns

### Link Component

```tsx
import { Link } from "react-router-dom";

function Navigation() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
      <Link to="/todos">Todos</Link>
    </nav>
  );
}
```

**Why Link instead of `<a>`?**

| `<a href="/about">` | `<Link to="/about">` |
|---------------------|----------------------|
| Full page reload | No reload |
| Server request | Client-side only |
| Loses React state | Preserves state |

### Programmatic Navigation

```tsx
import { useNavigate } from "react-router-dom";

function LoginButton() {
  const navigate = useNavigate();

  async function handleLogin() {
    await login();
    navigate("/dashboard");  // Navigate after action
  }

  return <button onClick={handleLogin}>Login</button>;
}
```

### Navigation with State

```tsx
// Sending state
navigate("/details", { state: { fromDashboard: true } });

// Receiving state
import { useLocation } from "react-router-dom";

function DetailsPage() {
  const location = useLocation();
  const { fromDashboard } = location.state || {};
  // ...
}
```

---

## Route Parameters

### URL Parameters

```tsx
<Route path="/users/:userId" element={<UserProfile />} />
```

Access in component:

```tsx
import { useParams } from "react-router-dom";

function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  // userId is from the URL: /users/123 → userId = "123"
}
```

### Query Parameters

```tsx
import { useSearchParams } from "react-router-dom";

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q");  // /search?q=hello → "hello"

  function updateSearch(newQuery: string) {
    setSearchParams({ q: newQuery });
  }
}
```

---

## SSR and Routing

When the server receives a request for `/todos`:

```
1. Express receives GET /todos
2. SSR handler extracts the path
3. StaticRouter renders with location="/todos"
4. React Router matches <Route path="/todos" />
5. TodosPage component renders to HTML
6. HTML sent to browser
7. Browser hydrates with BrowserRouter
8. React Router takes over for future navigation
```

### The Critical Match

The server and client must render the **same component** for the same URL. If they don't, hydration fails.

```tsx
// Server renders: StaticRouter location="/todos" → TodosPage
// Client renders: BrowserRouter at /todos → TodosPage ✓ Match!
```

---

## History API Fallback

**Problem:** When a user refreshes `/todos`, the browser requests `/todos` from the server. Without special handling, this returns 404 (no file at `/todos`).

**Solution 1: Development (Webpack)**

```javascript
// webpack.config.cjs
devServer: {
  historyApiFallback: true,  // Return index.html for all routes
}
```

**Solution 2: Production (Express)**

```typescript
// apps/bff/src/index.ts
// The SSR handler catches all non-API, non-static routes
app.use(createSsrHandler(staticDir));
```

The BFF server handles this by:
1. Checking if request is for a static file (JS, CSS, images)
2. Checking if request is for an API route
3. Otherwise, running SSR for the requested path

---

## Error Boundary

**File:** `packages/ui/src/components/ErrorBoundary.tsx`

```tsx
export class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

**Why wrap routes in ErrorBoundary?**

If a page component throws an error during render:
- Without ErrorBoundary: Entire app crashes, white screen
- With ErrorBoundary: Shows error message, rest of app still works

---

## Common Issues

### 1. 404 on Page Refresh

**Symptom:** Navigating works, but refreshing shows 404.

**Cause:** Server doesn't know about client routes.

**Fix:** Configure server to return index.html for all routes (or use SSR like this project does).

### 2. Hydration Mismatch

**Symptom:** Console error about hydration, content flickers.

**Cause:** Server and client render different content for the same URL.

**Fix:** Ensure route configuration is identical on server and client. Check that data is properly transferred.

### 3. Links Not Working

**Symptom:** Clicking links causes full page reload.

**Cause:** Using `<a>` instead of `<Link>`, or Link is outside Router.

**Fix:**
```tsx
// Wrong
<a href="/about">About</a>

// Right
<Link to="/about">About</Link>

// Ensure App is inside Router
<BrowserRouter>
  <App />  {/* Links inside App will work */}
</BrowserRouter>
```

### 4. useNavigate Outside Router

**Symptom:** Error "useNavigate() may be used only in the context of a Router"

**Cause:** Calling navigation hooks outside the Router component tree.

**Fix:** Ensure the component using `useNavigate` is a child of `BrowserRouter` or `StaticRouter`.

---

## Why No Lazy Loading?

You might expect to see:

```tsx
const TodosPage = React.lazy(() => import("./pages/TodosPage"));

<Suspense fallback={<Loading />}>
  <Routes>
    <Route path="/todos" element={<TodosPage />} />
  </Routes>
</Suspense>
```

**Why we don't use this:**

`React.lazy()` requires `<Suspense>`, which doesn't work with `renderToString()` (the SSR function). The server would render the fallback, not the actual page.

**Trade-off:**
- With lazy loading: Smaller initial bundle, but SSR shows loading states
- Without lazy loading: Larger bundle, but SSR shows real content

For SSR, we chose real content. See [Code Splitting](./12-code-splitting.md) for alternatives.

---

## Alternative Approaches

### 1. File-Based Routing

Frameworks like Next.js and Remix use file structure for routes:

```
pages/
├── index.tsx        → /
├── about.tsx        → /about
└── todos/
    └── index.tsx    → /todos
```

**Trade-off:** Less explicit, but more automatic.

### 2. Data Routers (React Router 6.4+)

React Router now supports data loading in route definitions:

```tsx
const router = createBrowserRouter([
  {
    path: "/todos",
    element: <TodosPage />,
    loader: async () => {
      return fetch("/api/todos");
    },
  },
]);
```

**Trade-off:** Moves data fetching into router, but requires different SSR approach.

### 3. TanStack Router

Type-safe routing with better TypeScript integration:

```tsx
const todosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todos",
  component: TodosPage,
  validateSearch: (search) => ({ page: Number(search.page) || 1 }),
});
```

**Trade-off:** Better type safety, but different API to learn.
