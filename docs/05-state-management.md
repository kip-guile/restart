# State Management

This document explains how application state is managed using Redux Toolkit.

## Overview

The application uses **Redux Toolkit (RTK)** for state management. Redux provides:

1. A single source of truth (the store)
2. Predictable state updates (actions → reducer → new state)
3. Easy debugging (time-travel, action logging)

```
┌─────────────────────────────────────────────────────────────────┐
│                         REDUX STORE                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                          State                               ││
│  │  ┌─────────────────┐    ┌────────────────────────────────┐  ││
│  │  │    app slice    │    │           api slice            │  ││
│  │  │  ┌───────────┐  │    │  ┌──────────────────────────┐  │  ││
│  │  │  │ message   │  │    │  │  queries cache           │  │  ││
│  │  │  │ bootstrap │  │    │  │  (RTK Query manages)     │  │  ││
│  │  │  └───────────┘  │    │  └──────────────────────────┘  │  ││
│  │  └─────────────────┘    └────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         ▲                              │
         │ dispatch(action)             │ useSelector(state)
         │                              ▼
    ┌─────────────────────────────────────────┐
    │              React Components            │
    └─────────────────────────────────────────┘
```

## Store Configuration

**File:** `packages/ui/src/store/store.ts`

```typescript
import { configureStore } from "@reduxjs/toolkit";
import { appSlice } from "./appSlice.js";
import { createApiSlice } from "./api.js";

export function makeStore(opts: {
  apiBaseUrl: string;
  preloadedState?: unknown;
  api?: ReturnType<typeof createApiSlice>;
}) {
  const { apiBaseUrl, preloadedState, api: existingApi } = opts;

  // Create or reuse API slice
  const api = existingApi ?? createApiSlice(apiBaseUrl);

  const store = configureStore({
    reducer: {
      app: appSlice.reducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
    preloadedState: preloadedState as RootState | undefined,
  });

  return { store, api };
}
```

### Why a Factory Function?

**Problem:** Both server (SSR) and client need stores, but with different configurations.

| Environment | API Base URL | Preloaded State |
|-------------|--------------|-----------------|
| Server | Full URL (`http://localhost:3000/api`) | None |
| Client | Relative (`/api`) | From `window.__PRELOADED_STATE__` |

**Solution:** A factory function that accepts configuration.

```typescript
// Server creates fresh store for each request
const { store } = makeStore({ apiBaseUrl: "http://localhost:3000/api" });

// Client creates store with server's state
const { store } = makeStore({
  apiBaseUrl: "/api",
  preloadedState: window.__PRELOADED_STATE__,
});
```

---

## App Slice

**File:** `packages/ui/src/store/appSlice.ts`

```typescript
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { BootstrapPayload } from "@restart/shared";

type AppState = {
  message: string;
  bootstrap: BootstrapPayload | null;
};

const initialState: AppState = {
  message: "",
  bootstrap: null,
};

export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setMessage(state, action: PayloadAction<string>) {
      state.message = action.payload;
    },
    setBootstrap(state, action: PayloadAction<BootstrapPayload>) {
      state.bootstrap = action.payload;
    },
  },
});

export const { setMessage, setBootstrap } = appSlice.actions;
```

### Understanding createSlice

`createSlice` is Redux Toolkit's way to define:
- State shape (`initialState`)
- How state changes (`reducers`)
- Action creators (automatically generated)

**Without Redux Toolkit:**
```typescript
// Manual action types
const SET_MESSAGE = "app/setMessage";

// Manual action creator
function setMessage(message: string) {
  return { type: SET_MESSAGE, payload: message };
}

// Manual reducer with switch
function appReducer(state = initialState, action) {
  switch (action.type) {
    case SET_MESSAGE:
      return { ...state, message: action.payload };
    default:
      return state;
  }
}
```

**With createSlice:** All of this is generated automatically!

### Immer Integration

Notice the reducer looks like it mutates state:

```typescript
setMessage(state, action: PayloadAction<string>) {
  state.message = action.payload;  // Looks like mutation!
}
```

This works because Redux Toolkit uses **Immer**. Immer tracks changes to a draft state and produces an immutable update behind the scenes.

**What actually happens:**
```typescript
// Your code (mutating draft):
state.message = "Hello";

// What Immer produces (immutable update):
return { ...state, message: "Hello" };
```

---

## API Slice (RTK Query)

**File:** `packages/ui/src/store/api.ts`

```typescript
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Todo } from "@restart/shared";

type HelloResponse = { message: string };

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

RTK Query handles:
- Fetching data
- Caching responses
- Tracking loading/error states
- Automatic refetching

See [Data Fetching](./06-data-fetching.md) for detailed RTK Query documentation.

---

## Using State in Components

### Reading State

```typescript
import { useSelector } from "react-redux";
import type { RootState } from "@restart/ui";

function Greeting() {
  const message = useSelector((state: RootState) => state.app.message);
  return <h1>{message}</h1>;
}
```

### Dispatching Actions

```typescript
import { useDispatch } from "react-redux";
import { setMessage } from "@restart/ui";

function MessageForm() {
  const dispatch = useDispatch();

  function handleSubmit(newMessage: string) {
    dispatch(setMessage(newMessage));
  }

  return <form onSubmit={/* ... */}>...</form>;
}
```

### Typed Hooks

**File:** `packages/ui/src/store/store.ts`

```typescript
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

For better type inference, create typed versions of hooks:

```typescript
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux";

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

Then in components:

```typescript
// Instead of:
const message = useSelector((state: RootState) => state.app.message);

// Use:
const message = useAppSelector((state) => state.app.message);
// TypeScript infers the correct type!
```

---

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interaction                          │
│                     (click, form submit, etc.)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Component Handler                           │
│              dispatch(setMessage("Hello"))                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Redux Store                              │
│  1. Receives action: { type: "app/setMessage", payload: "Hi" }  │
│  2. Calls reducer with current state + action                    │
│  3. Reducer returns new state                                    │
│  4. Store updates state                                          │
│  5. Notifies all subscribers                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    useSelector Re-renders                        │
│            Component re-renders with new state                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Bootstrap Application

**File:** `packages/ui/src/bootstrap/applyBootstrapToStore.ts`

```typescript
import { setMessage, setBootstrap } from "../store/appSlice.js";
import type { BootstrapPayload } from "@restart/shared";
import type { AppDispatch } from "../store/store.js";

export function applyBootstrapToStore(
  bootstrap: BootstrapPayload,
  dispatch: AppDispatch
): void {
  dispatch(setBootstrap(bootstrap));
  dispatch(setMessage(bootstrap.greeting));
}
```

**What is bootstrap?**

Bootstrap is the initial data a page needs to render. Instead of fetching on mount:

```typescript
// Without bootstrap (bad for SSR)
function Homepage() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/hello").then(/* ... */);
  }, []);

  return <h1>{message || "Loading..."}</h1>;
}
```

We pre-load data:

```typescript
// With bootstrap (SSR-friendly)
function Homepage() {
  const message = useSelector((state) => state.app.message);
  return <h1>{message}</h1>;  // Already has data!
}
```

---

## DevTools

Redux DevTools let you:
- See every action dispatched
- Inspect state at any point
- Time-travel through state changes
- Export/import state

### Installation

1. Install browser extension: [Redux DevTools](https://github.com/reduxjs/redux-devtools)
2. Redux Toolkit automatically connects in development

### Using DevTools

1. Open browser DevTools
2. Go to "Redux" tab
3. See action history on left
4. See state tree on right
5. Click actions to time-travel

---

## Common Patterns

### Selecting Derived Data

```typescript
// Don't compute in component (runs every render)
function TodoList() {
  const todos = useSelector((state) => state.todos);
  const completed = todos.filter((t) => t.completed);  // Computed every render!
}

// Better: compute in selector (memoized)
const selectCompletedTodos = (state: RootState) =>
  state.todos.filter((t) => t.completed);

function TodoList() {
  const completed = useSelector(selectCompletedTodos);
}

// Best: use createSelector for memoization
import { createSelector } from "@reduxjs/toolkit";

const selectCompletedTodos = createSelector(
  (state: RootState) => state.todos,
  (todos) => todos.filter((t) => t.completed)
);
```

### Async Actions with Thunks

For complex async logic:

```typescript
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchUserData = createAsyncThunk(
  "user/fetchData",
  async (userId: string, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      return await response.json();
    } catch (error) {
      return rejectWithValue("Failed to fetch user");
    }
  }
);

// In slice:
extraReducers: (builder) => {
  builder
    .addCase(fetchUserData.pending, (state) => {
      state.loading = true;
    })
    .addCase(fetchUserData.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload;
    })
    .addCase(fetchUserData.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });
}
```

**Note:** For data fetching, RTK Query (see [Data Fetching](./06-data-fetching.md)) is usually better than thunks.

---

## Common Issues

### 1. "Cannot read property of undefined"

**Symptom:** State access fails.

**Cause:** Accessing state before it's initialized.

**Fix:** Provide default values or check for undefined:

```typescript
const message = useSelector((state) => state.app.message ?? "");
```

### 2. Component Not Updating

**Symptom:** State changes but component doesn't re-render.

**Cause:** Selector returns new object reference every time.

```typescript
// Bad: Creates new object every call
const user = useSelector((state) => ({
  name: state.user.name,
  email: state.user.email,
}));

// Good: Return existing references
const name = useSelector((state) => state.user.name);
const email = useSelector((state) => state.user.email);

// Or use createSelector
const selectUser = createSelector(
  (state) => state.user.name,
  (state) => state.user.email,
  (name, email) => ({ name, email })
);
```

### 3. Circular Dependencies

**Symptom:** Import errors or undefined values.

**Cause:** Store imports slice which imports store.

**Fix:** Keep store creation separate from slice definitions. The factory pattern helps:

```typescript
// store.ts imports slices (one direction only)
import { appSlice } from "./appSlice.js";

// appSlice.ts has no store imports
export const appSlice = createSlice({ /* ... */ });
```

---

## Alternative Approaches

### 1. Zustand

Simpler API, less boilerplate:

```typescript
import { create } from "zustand";

const useStore = create((set) => ({
  message: "",
  setMessage: (message) => set({ message }),
}));

function Component() {
  const message = useStore((state) => state.message);
}
```

**Trade-off:** Simpler, but less tooling (DevTools, middleware).

### 2. Jotai

Atomic state management:

```typescript
import { atom, useAtom } from "jotai";

const messageAtom = atom("");

function Component() {
  const [message, setMessage] = useAtom(messageAtom);
}
```

**Trade-off:** More flexible, but different mental model.

### 3. React Context

Built-in React feature:

```typescript
const AppContext = createContext({ message: "" });

function Component() {
  const { message } = useContext(AppContext);
}
```

**Trade-off:** No extra dependencies, but re-renders entire tree on changes.

### Why Redux Toolkit?

For this project, RTK was chosen because:
- RTK Query integrates data fetching with state
- DevTools are excellent for debugging
- Predictable state helps with SSR hydration
- Large ecosystem and documentation
