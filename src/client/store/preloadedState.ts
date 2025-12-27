import type { RootState } from "./store";

declare global {
  interface Window {
    __PRELOADED_STATE__?: unknown;
  }
}

export function getPreloadedState(): Partial<RootState> | undefined {
  const raw = window.__PRELOADED_STATE__;
  if (!raw) return undefined;

  // Small hygiene: remove it so it is not kept around
  delete window.__PRELOADED_STATE__;

  // For now we trust it. Later we can validate it.
  return raw as Partial<RootState>;
}
