import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { api } from "./api";

type AppState = {
  message: string | null;
};

type AppSliceState = {
  message: string | null;
};

const initialAppState: AppState = {
  message: null,
};

const appSlice = createSlice({
  name: "app",
  initialState: initialAppState,
  reducers: {
    setMessage(state, action: PayloadAction<string>) {
      state.message = action.payload;
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

export const { setMessage } = appSlice.actions;

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
