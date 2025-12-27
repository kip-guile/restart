import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { makeStore } from "./store/store";
import { getPreloadedState } from "./store/preloadedState";
import { App } from "./App";
import { applyBootstrapToStore, fetchBootstrap, readBootstrapFromWindow } from "./bootstrap";
import "./styles.css";

const store = makeStore(getPreloadedState());

async function start() {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Missing #root element");
  }

  const store = makeStore();

  const injected = readBootstrapFromWindow();
  if (injected) {
    applyBootstrapToStore(injected, store.dispatch);
  } else {
    // dev path: fetch from BFF
    const payload = await fetchBootstrap(window.location.pathname);
    applyBootstrapToStore(payload, store.dispatch);
  }

  createRoot(rootEl).render(
    <React.StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </React.StrictMode>
  );
}

void start();