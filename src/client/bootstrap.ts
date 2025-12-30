import type { BootstrapPayload } from "../shared/bootstrap";
import { setMessage, setBootstrap } from "./store/store";

declare global {
  interface Window {
    __BOOTSTRAP__?: unknown;
  }
}

export function readBootstrapFromWindow(): BootstrapPayload | null {
  const raw = window.__BOOTSTRAP__;
  if (!raw) return null;

  delete window.__BOOTSTRAP__;
  if (typeof raw !== "object" || raw === null) return null;
  if (!("route" in raw) || !("page" in raw)) return null;

  return raw as BootstrapPayload;
}

export async function fetchBootstrap(route: string): Promise<BootstrapPayload> {
  try {
    const res = await fetch(`/api/bootstrap?path=${encodeURIComponent(route)}`);

    if (!res.ok) {
      return {
        route,
        greeting: "Welcome back",
        page: {
          kind: "error",
          status: res.status,
          code: "BOOTSTRAP_UPSTREAM",
          message: "We could not load the page data. Please retry.",
        },
      };
    }

    return (await res.json()) as BootstrapPayload;
  } catch {
    // Network error, aborted request, etc.
    return {
      route,
      greeting: "Welcome back",
      page: {
        kind: "error",
        status: 0,
        code: "BOOTSTRAP_UNKNOWN",
        message: "Network error while loading. Please retry.",
      },
    };
  }
}

function makeClientErrorBootstrap(route: string, status = 0): BootstrapPayload {
  return {
    route,
    greeting: "Welcome back",
    page: {
      kind: "error",
      status,
      code: status === 0 ? "BOOTSTRAP_UNKNOWN" : "BOOTSTRAP_UPSTREAM",
      message: "We could not load the page data. Please retry.",
    },
  };
}

export async function getBootstrap(route: string): Promise<BootstrapPayload> {
  try {
    // If your fetchBootstrap already returns error payloads, this try/catch is still fine.
    return await fetchBootstrap(route);
  } catch {
    // Only hits when the request itself failed or your fetchBootstrap throws.
    return makeClientErrorBootstrap(route, 0);
  }
}

// Convert bootstrap payload into Redux actions (mapping layer)
export function applyBootstrapToStore(
  payload: BootstrapPayload,
  dispatch: (a: unknown) => void,
) {
  dispatch(setBootstrap(payload));
  if (payload.page.kind !== "error") {
    dispatch(setMessage(payload.greeting));
  }
}
