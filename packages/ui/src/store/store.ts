import {
  configureStore,
  createSlice,
  combineReducers,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { createApiSlice } from "./api.js";
import type { BootstrapPayload } from "@restart/shared";

type AppState = {
  message: string | null;
  bootstrap: BootstrapPayload | null;
};

const initialAppState: AppState = {
  message: null,
  bootstrap: null,
};

const appSlice = createSlice({
  name: "app",
  initialState: initialAppState,
  reducers: {
    setMessage(state, action: PayloadAction<string>) {
      state.message = action.payload;
    },
    setBootstrap(state, action: PayloadAction<BootstrapPayload>) {
      state.bootstrap = action.payload;
    },
  },
});

type MakeStoreOptions = {
  apiBaseUrl: string;
  preloadedState?: unknown;
  api?: ReturnType<typeof createApiSlice>;
};

export function makeStore(opts: MakeStoreOptions) {
  const api = opts.api ?? createApiSlice(opts.apiBaseUrl);
  const rootReducer = combineReducers({
    app: appSlice.reducer,
    [api.reducerPath]: api.reducer,
  });

  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(api.middleware),
    preloadedState: opts.preloadedState as any,
    devTools: process.env.NODE_ENV !== "production",
  });
  return { store, api };
}

export const { setMessage, setBootstrap } = appSlice.actions;

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["store"]["getState"]>;
export type AppDispatch = AppStore["store"]["dispatch"];
