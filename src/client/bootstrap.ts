import type { BootstrapPayload } from "../shared/bootstrap";
import { setMessage } from "./store/store";

declare global {
  interface Window {
    __BOOTSTRAP__?: unknown;
  }
}

export function readBootstrapFromWindow(): BootstrapPayload | null {
  const raw = window.__BOOTSTRAP__;
  if (!raw) return null;

  delete window.__BOOTSTRAP__;
  return raw as BootstrapPayload;
}

export async function fetchBootstrap(route: string): Promise<BootstrapPayload> {
  const res = await fetch(`/api/bootstrap?path=${encodeURIComponent(route)}`);
  if (!res.ok) throw new Error(`Bootstrap fetch failed: ${res.status}`);
  return (await res.json()) as BootstrapPayload;
}

// Convert bootstrap payload into Redux actions (mapping layer)
export function applyBootstrapToStore(
  payload: BootstrapPayload,
  dispatch: (a: unknown) => void,
) {
  // For now we map greeting -> message in your app slice
  dispatch(setMessage(payload.greeting));
}
