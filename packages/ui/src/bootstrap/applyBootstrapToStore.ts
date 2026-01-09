import { setMessage, setBootstrap } from "../store/store.js";
import type { BootstrapPayload } from "@restart/shared";

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
