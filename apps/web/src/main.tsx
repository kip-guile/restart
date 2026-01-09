import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";

import { App, makeStore, applyBootstrapToStore } from "@restart/ui";
import { readBootstrapFromWindow, getBootstrap, seedRtkQueryFromBootstrap } from "./bootstrap";

import "./styles.css";

async function start() {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root element");

  const store = makeStore();

  const injected = readBootstrapFromWindow();
  const payload = injected ?? (await getBootstrap(window.location.pathname));

  applyBootstrapToStore(payload, store.dispatch);
  seedRtkQueryFromBootstrap(store, payload);

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
