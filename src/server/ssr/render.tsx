import React from "react";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { renderToString } from "react-dom/server";
import { Provider } from "react-redux";
import { StaticRouter } from "react-router";
import type { RequestContext } from "../requestContext.js";
import type { BootstrapPayload } from "../../shared/bootstrap.js";
import { makeStore } from "../../app/store/store.js";
import { applyBootstrapToStore } from "../../client/bootstrap.js";
import {App} from "../../app/App.js";
import { api } from "../../app/store/api.js";

function escapeJsonForHtml(json: unknown) {
  return JSON.stringify(json).replace(/</g, "\\u003c");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..", "..", "..");
const staticDir = path.join(projectRoot, "static");

async function readIndexHtml(): Promise<string> {
  return fs.readFile(path.join(staticDir, "index.html"), "utf-8");
}

export async function renderHtml(opts: {
  ctx: RequestContext;
  bootstrap: BootstrapPayload;
  assetScriptSrc: string; // in prod, your hashed bundle path
}): Promise<string> {
  const store = makeStore();
  applyBootstrapToStore(opts.bootstrap, store.dispatch);

  if (opts.bootstrap.page.kind === "todos") {
    store.dispatch(api.endpoints.getTodos.initiate());
    await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
  }

  const appHtml = renderToString(
    <Provider store={store}>
      <StaticRouter location={opts.ctx.route}>
        <App />
      </StaticRouter>
    </Provider>,
  );

  const bootstrapJson = escapeJsonForHtml(opts.bootstrap);
  const injectedBootstrap = `<script>window.__BOOTSTRAP__=${bootstrapJson};</script>`;

  const template = await readIndexHtml();

  const withRoot = template.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${appHtml}</div>`,
  );

  // Inject bootstrap script so the client uses the same payload during hydration
  const withBootstrap = withRoot.includes("</head>")
    ? withRoot.replace("</head>", `${injectedBootstrap}</head>`)
    : withRoot.replace("</body>", `${injectedBootstrap}</body>`);

  return withBootstrap
}
