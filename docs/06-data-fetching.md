# Data Fetching

This document explains how the application fetches data, including RTK Query on the client and HTTP utilities on the server.

## Overview

Data fetching happens in two contexts:

| Context | Tool | Purpose |
|---------|------|---------|
| **Client** | RTK Query | Fetch data, cache results, manage loading states |
| **Server** | Custom HTTP Client | Fetch data for SSR with tracing and retry |

```
┌────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                        │
│                                                                 │
│  ┌─────────────┐        ┌─────────────────────────────────┐    │
│  │  Component  │──uses──│         RTK Query               │    │
│  │  useQuery() │        │  • Auto-caching                 │    │
│  └─────────────┘        │  • Loading/error states         │    │
│                         │  • Background refetching        │    │
│                         └───────────────┬─────────────────┘    │
│                                         │                       │
└─────────────────────────────────────────┼───────────────────────┘
                                          │ fetch("/api/todos")
                                          ▼
┌────────────────────────────────────────────────────────────────┐
│                         SERVER (BFF)                            │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    HTTP Client                          │    │
│  │  • Request ID tracing                                   │    │
│  │  • Timeout handling                                     │    │
│  │  • Retry with exponential backoff                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │ fetch to external API
                               ▼
                    ┌────────────────────┐
                    │   External APIs    │
                    │ (jsonplaceholder)  │
                    └────────────────────┘
```

---

## RTK Query (Client)

RTK Query is Redux Toolkit's data fetching solution. It generates hooks for each endpoint that handle:
- Fetching data
- Caching responses
- Tracking loading/error states
- Refetching when needed

### API Definition

**File:** `packages/ui/src/store/api.ts`

```typescript
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Todo } from "@restart/shared";

export function createApiSlice(baseUrl: string) {
  return createApi({
    reducerPath: "api",
    baseQuery: fetchBaseQuery({ baseUrl }),
    endpoints: (builder) => ({
      hello: builder.query<HelloResponse, void>({
        query: () => "/hello",
      }),
      getTodos: builder.query<Todo[], void>({
        query: () => "/todos",
      }),
    }),
  });
}
```

### Understanding the Parts

**`createApi`** - Creates an API slice with endpoints.

**`fetchBaseQuery`** - A wrapper around `fetch` with conveniences:
- Automatic JSON parsing
- Base URL prepending
- Header management

**`builder.query`** - Defines a GET endpoint. Generic types are:
- First: Response type (`Todo[]`)
- Second: Argument type (`void` = no arguments)

**`query`** - The URL path (relative to `baseUrl`).

### Using Queries in Components

```typescript
import { useGetTodosQuery } from "@restart/ui";

function TodosPage() {
  const { data, isLoading, error } = useGetTodosQuery();

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error loading todos</p>;

  return (
    <ul>
      {data?.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

### Hook Return Values

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T \| undefined` | The response data (if successful) |
| `isLoading` | `boolean` | True during first fetch |
| `isFetching` | `boolean` | True during any fetch (including refetch) |
| `error` | `Error \| undefined` | Error object if request failed |
| `isSuccess` | `boolean` | True if data is available |
| `isError` | `boolean` | True if request failed |
| `refetch` | `() => void` | Manually trigger refetch |

### Query with Arguments

```typescript
// API definition
getTodoById: builder.query<Todo, number>({
  query: (id) => `/todos/${id}`,
}),

// In component
const { data } = useGetTodoByIdQuery(42);
```

### Caching Behavior

RTK Query caches responses by endpoint + arguments:

```typescript
// These share a cache entry (same endpoint, same args)
useGetTodosQuery();  // Component A
useGetTodosQuery();  // Component B - uses cached data!

// These are separate cache entries
useGetTodoByIdQuery(1);  // Cached as getTodoById(1)
useGetTodoByIdQuery(2);  // Cached as getTodoById(2)
```

**Cache Lifetime:**
- Data stays cached while any component subscribes
- After last subscriber unmounts, cache kept for 60 seconds (default)
- Then garbage collected

---

## Server HTTP Client

**File:** `apps/bff/src/server/httpClient.ts`

The server needs its own HTTP client for:
1. **Request tracing** - Track requests across services
2. **Timeout handling** - Don't wait forever
3. **Retry logic** - Handle temporary failures

```typescript
export type HttpClient = {
  getJson<T>(url: string, opts?: { timeoutMs?: number; retries?: number }): Promise<T>;
};

export function createHttpClient(config: { requestId: string }): HttpClient {
  // ... implementation
}
```

### Using the Client

**File:** `apps/bff/src/server/external/api.ts`

```typescript
export async function getTodos(
  http: HttpClient,
  limit: number = 5
): Promise<ExternalTodo[]> {
  const url = `https://jsonplaceholder.typicode.com/todos?_limit=${limit}`;
  return http.getJson<ExternalTodo[]>(url);
}
```

### Request Flow

```
1. Create client with request ID
   const http = createHttpClient({ requestId: "abc123" });

2. Make request with timeout
   const data = await http.getJson(url, { timeoutMs: 5000 });

3. Client sets up AbortController
   const controller = new AbortController();
   setTimeout(() => controller.abort(), 5000);

4. Makes fetch with signal
   fetch(url, { signal: controller.signal, headers: { "X-Request-ID": "abc123" } })

5. On success: Parse JSON, return data
6. On timeout: AbortError thrown, retry if allowed
7. On network error: TypeError, retry if allowed
8. On HTTP error (404, 500): Throw immediately (no retry)
```

### Retry Logic

```typescript
function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const isAbort = error.name === "AbortError";    // Timeout
  const isNetwork = error instanceof TypeError;   // Network failure

  return isAbort || isNetwork;
}
```

**What we retry:**
- `AbortError` - Request timed out
- `TypeError` - Network failed (DNS, connection refused)

**What we don't retry:**
- HTTP 4xx/5xx - Server responded with error (it's not a temporary failure)
- Parse errors - Response wasn't valid JSON

### Exponential Backoff

```typescript
// Wait longer between each retry
await sleep(100 * (attempt + 1));

// Attempt 0: wait 100ms
// Attempt 1: wait 200ms
// Attempt 2: wait 300ms
```

**Why?** If a service is overloaded, hammering it with retries makes things worse. Backing off gives it time to recover.

---

## Shared HTTP Utilities

**File:** `packages/shared/src/utils/http.ts`

Reusable HTTP utilities for both client and server:

```typescript
export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export async function fetchJson<T>(
  url: string,
  options?: FetchOptions
): Promise<FetchResult<T>> {
  // ... implementation
}
```

### Result Type Pattern

Instead of throwing errors:

```typescript
// Throwing (traditional)
try {
  const data = await fetchJson(url);
  return data;
} catch (error) {
  // Error handling scattered
}
```

We return a result:

```typescript
// Result type (explicit)
const result = await fetchJson(url);
if (!result.ok) {
  console.log(result.error);  // TypeScript knows this exists
  return;
}
console.log(result.data);  // TypeScript knows this is the data
```

**Why?** Makes error handling explicit. You can't forget to handle errors because TypeScript enforces checking `result.ok`.

---

## Error Handling Patterns

### Client (RTK Query)

```typescript
function TodosPage() {
  const { data, isLoading, error } = useGetTodosQuery();

  // Handle loading
  if (isLoading) {
    return <Skeleton />;
  }

  // Handle error
  if (error) {
    return (
      <ErrorMessage
        message="Failed to load todos"
        onRetry={() => refetch()}
      />
    );
  }

  // Handle empty state
  if (!data || data.length === 0) {
    return <EmptyState message="No todos yet" />;
  }

  // Happy path
  return <TodoList todos={data} />;
}
```

### Server (Bootstrap)

```typescript
// apps/bff/src/server/bootstrap.ts
export async function getBootstrapPayload(
  route: string,
  http: HttpClient
): Promise<BootstrapPayload> {
  try {
    const [user, todos] = await Promise.all([
      getUserName(http),
      getTodos(http),
    ]);

    return makeTodosBootstrap(route, `Hello, ${user}!`, todos);
  } catch (error) {
    // Return error bootstrap instead of crashing
    return makeErrorBootstrap(route, {
      status: 500,
      code: "BOOTSTRAP_UPSTREAM",
      message: "Failed to fetch data",
    });
  }
}
```

---

## Caching Strategies

### Client Caching (RTK Query)

```typescript
createApi({
  // ... other config
  keepUnusedDataFor: 60,  // Keep data 60s after last subscriber
  refetchOnMountOrArgChange: false,  // Don't refetch on re-mount
  refetchOnFocus: false,  // Don't refetch when window regains focus
  refetchOnReconnect: true,  // Refetch when network reconnects
})
```

### Server Caching

**File:** `apps/bff/src/server/cache.ts`

```typescript
export class TTLCache<T> {
  private map = new Map<string, { value: T; expiresAtMs: number }>();

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAtMs) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.map.set(key, {
      value,
      expiresAtMs: Date.now() + this.ttlMs,
    });
  }
}
```

**Two cache layers:**
- **Public cache** - Shared across anonymous users (key: route)
- **Private cache** - Per-user for authenticated users (key: userId + route)

---

## API Layer Architecture

```
packages/ui/src/store/
├── api.ts          # RTK Query API definition (client)
└── browserApi.ts   # Pre-configured API instance for browser

apps/bff/src/server/
├── httpClient.ts   # HTTP client with tracing (server)
└── external/
    ├── api.ts      # External API functions
    └── types.ts    # External API response types

packages/shared/src/utils/
└── http.ts         # Shared HTTP utilities (isomorphic)
```

### Why Separate Internal and External Types?

External APIs might change. We transform to internal types:

```typescript
// External type (from jsonplaceholder)
type ExternalTodo = {
  id: number;
  title: string;
  completed: boolean;
  userId: number;  // We don't need this
};

// Internal type (our app)
type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

// Transform
function toInternalTodo(external: ExternalTodo): Todo {
  return {
    id: external.id,
    title: external.title,
    completed: external.completed,
  };
}
```

**Benefits:**
- Internal code doesn't depend on external API shape
- Can add/remove fields in the transform
- Type changes are isolated to one place

---

## Common Issues

### 1. "Query hook called outside Provider"

**Symptom:** Error when using `useGetTodosQuery()`.

**Cause:** Component not wrapped in Redux Provider.

**Fix:**
```tsx
<Provider store={store}>
  <App />  {/* useQuery works inside here */}
</Provider>
```

### 2. Data is `undefined` After Successful Fetch

**Symptom:** `isSuccess` is true but `data` is undefined.

**Cause:** The endpoint returned `undefined` or `null`.

**Fix:** Check API response. RTK Query passes through what the endpoint returns.

### 3. Too Many Requests

**Symptom:** Same endpoint called multiple times.

**Cause:** Each `useQuery` triggers a fetch if not cached.

**Fix:** RTK Query deduplicates automatically, but check:
- Are components mounting/unmounting rapidly?
- Is the cache being invalidated?

### 4. CORS Errors

**Symptom:** "Blocked by CORS policy" in console.

**Cause:** Browser blocks requests to different origins.

**Fix:**
- Use the BFF to proxy requests (this project's approach)
- Or configure the external API to allow your origin

---

## Alternative Approaches

### 1. TanStack Query (React Query)

Similar to RTK Query but framework-agnostic:

```typescript
import { useQuery } from "@tanstack/react-query";

function TodosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => fetch("/api/todos").then((r) => r.json()),
  });
}
```

**Trade-off:** More flexible, but doesn't integrate with Redux.

### 2. SWR

Vercel's data fetching library:

```typescript
import useSWR from "swr";

function TodosPage() {
  const { data, error } = useSWR("/api/todos", fetcher);
}
```

**Trade-off:** Simpler API, stale-while-revalidate by default.

### 3. Plain fetch with React hooks

```typescript
function useTodos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/todos")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
```

**Trade-off:** No dependencies, but no caching, deduplication, or SSR support.

### Why RTK Query?

For this project, RTK Query was chosen because:
- Integrates with Redux store (important for SSR state transfer)
- Handles cache invalidation and refetching
- Generated hooks are type-safe
- Can pre-populate cache from SSR data
