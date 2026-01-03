// server/ssr/render.tsx
import React from "react";
import { renderToString } from "react-dom/server";
import { Provider } from "react-redux";
import { StaticRouter } from "react-router";
import type { RequestContext } from "../requestContext.js";
import type { BootstrapPayload } from "../../shared/bootstrap.js";
import { makeStore } from "../../app/store/store.js";
import { applyBootstrapToStore } from "../../client/bootstrap.js";
import {App} from "../../app/App.js";

function escapeJsonForHtml(json: unknown) {
  return JSON.stringify(json).replace(/</g, "\\u003c");
}

export function renderHtml(opts: {
  ctx: RequestContext;
  bootstrap: BootstrapPayload;
  assetScriptSrc: string; // in prod, your hashed bundle path
}): string {
  const store = makeStore();
  applyBootstrapToStore(opts.bootstrap, store.dispatch);

  const appHtml = renderToString(
    <Provider store={store}>
      <StaticRouter location={opts.ctx.route}>
        <App />
      </StaticRouter>
    </Provider>,
  );

  const bootstrapJson = escapeJsonForHtml(opts.bootstrap);

  return `<!doctype html>
    <html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>SSR Playground</title>
    </head>
    <body>
        <div id="root">${appHtml}</div>
        <script>window.__BOOTSTRAP__ = ${bootstrapJson};</script>
        <script type="module" src="${opts.assetScriptSrc}"></script>
    </body>
    </html>`;
}
