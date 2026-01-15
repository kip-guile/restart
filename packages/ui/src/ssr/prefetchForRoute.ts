import type { EnhancedStore } from "@reduxjs/toolkit";

export async function prefetchForRoute(
  store: EnhancedStore,
  path: string,
  api: any
) {
  if (path === "/todos") {
    store.dispatch(api.endpoints.getTodos.initiate());
  }

  await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
}