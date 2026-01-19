/**
 * @fileoverview Client entry point
 *
 * TWO MODES OF OPERATION:
 *
 * 1. SSR HYDRATION (production via BFF on port 3000):
 *    - Server renders HTML with data
 *    - Injects __PRELOADED_STATE__ with Redux state (including RTK Query cache)
 *    - Client hydrates with preloaded state
 *    - RTK Query finds cached data, no fetch needed
 *
 * 2. CSR (development via webpack-dev-server on port 8080):
 *    - No server rendering, no preloaded state
 *    - Client renders immediately with empty store
 *    - RTK Query hooks fetch data automatically
 *    - Shows loading states, then renders data
 */
import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";

import { App, makeStore, applyBootstrapToStore, RootState, api } from "@restart/ui";
import { readBootstrapFromWindow, readPreloadedStateFromWindow } from "./bootstrap";
import { registerServiceWorker } from "./sw-register";

import "./styles.css";

function start() {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root element");

  // Check for SSR-injected state
  // Note: readPreloadedStateFromWindow returns null if not found, but Redux expects undefined
  const preloadedState = (readPreloadedStateFromWindow() ?? undefined) as Partial<RootState> | undefined;

  // Create store - with preloaded state if SSR, empty otherwise
  const { store } = makeStore({
    apiBaseUrl: "/api",
    preloadedState,
    api, // Pass browserApi so hooks use the same instance
  });

  // SSR hydration: seed RTK Query cache from preloaded state
  // This is necessary because RTK Query subscription tracking doesn't survive serialization
  if (preloadedState) {
    const bootstrap = preloadedState.app?.bootstrap;
    if (bootstrap?.page?.kind === "todos") {
      store.dispatch(
        api.util.upsertQueryData("getTodos", undefined, bootstrap.page.todos)
      );
    }
  } else {
    // CSR mode: check for bootstrap in window (legacy support)
    const bootstrap = readBootstrapFromWindow();
    if (bootstrap) {
      applyBootstrapToStore(bootstrap, store.dispatch);
      if (bootstrap.page?.kind === "todos") {
        store.dispatch(
          api.util.upsertQueryData("getTodos", undefined, bootstrap.page.todos)
        );
      }
    }
    // If no bootstrap, that's fine - RTK Query will fetch data as needed
  }

  const app = (
    <React.StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </React.StrictMode>
  );

  // Hydrate if server rendered, otherwise create fresh root
  const hasServerMarkup = rootEl.childNodes.length > 0;
  if (hasServerMarkup) {
    hydrateRoot(rootEl, app);
  } else {
    createRoot(rootEl).render(app);
  }

  // Register service worker (production only)
  registerServiceWorker({
    onUpdate: () => {
      console.log("New version available! Refresh to update.");
    },
    onSuccess: () => {
      console.log("App is ready for offline use.");
    },
  });
}

start();
