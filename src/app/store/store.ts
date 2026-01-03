import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { api } from "./api.js";
import type { BootstrapPayload } from "../../shared/bootstrap.js";

type AppState = {
  message: string | null;
  bootstrap: BootstrapPayload | null;
};

type AppSliceState = {
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

const rootReducer = {
  app: appSlice.reducer,
  [api.reducerPath]: api.reducer,
};

export type RootState = {
  app: AppSliceState;
};

export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    middleware: (gDM) => gDM().concat(api.middleware),
    preloadedState: preloadedState as RootState | undefined,
  });
}

export const { setMessage, setBootstrap } = appSlice.actions;

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
