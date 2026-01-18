import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";

import { App, makeStore, applyBootstrapToStore, RootState, api } from "@restart/ui";
import { readBootstrapFromWindow, getBootstrap, readPreloadedStateFromWindow } from "./bootstrap";

import "./styles.css";

async function start() {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root element");

  const preloadedState = readPreloadedStateFromWindow() as Partial<RootState> | undefined;

  // Use the shared browserApi instance to ensure hooks work correctly
  const { store } = makeStore({
    apiBaseUrl: "/api",
    preloadedState,
    api, // Pass the browserApi so hooks use the same store
  });

  // Only apply bootstrap if we don't have preloaded state
  // (preloaded state already contains the bootstrap data from SSR)
  if (!preloadedState) {
    const injected = readBootstrapFromWindow();
    const payload = injected ?? (await getBootstrap(window.location.pathname));
    applyBootstrapToStore(payload, store.dispatch);

    // Seed RTK Query cache for client-side navigation
    if (payload.page.kind === "todos") {
      store.dispatch(
        api.util.upsertQueryData("getTodos", undefined, payload.page.todos)
      );
    }
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

  const hasServerMarkup = rootEl.childNodes.length > 0;
  if (hasServerMarkup) hydrateRoot(rootEl, app);
  else createRoot(rootEl).render(app);
}

void start();
