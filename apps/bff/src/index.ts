import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

import { getPort } from "./server/env.js";
import { buildRequestContext } from "./server/requestContext.js";
import { getBootstrapPayload, getTodos } from "./server/bootstrap.js";
import { createHttpClient } from "./server/httpClient.js";
import { renderHtml } from "./server/ssr/render.js";

const app = express();
const port = getPort();

// Resolve absolute paths in a way that works in both:
// - tsx dev (apps/bff/src/index.ts)
// - compiled prod (apps/bff/dist/index.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We want apps/bff/static. From src/ or dist/, go one level up to apps/bff/
const bffRootDir = path.resolve(__dirname, "..");
const staticDir = path.join(bffRootDir, "static");

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the built client entry bundle.
 * For now we scan static/assets for app.*.js.
 * Later you can switch to a build manifest (more reliable).
 */
async function findClientBundleSrc(): Promise<string> {
  const assetsDir = path.join(staticDir, "assets");

  const assetsDirExists = await fileExists(assetsDir);
  if (!assetsDirExists) {
    throw new Error(
      `Missing assets directory at ${assetsDir}. Did you run the web build?`,
    );
  }

  const files = await fs.readdir(assetsDir);

  // Prefer "app." entry chunk. You can enhance this to check for ".mjs" too if needed.
  const appFile = files.find((f) => f.startsWith("app.") && f.endsWith(".js"));

  if (!appFile) {
    throw new Error(
      `Could not find app.*.js in ${assetsDir}. Found: ${files.join(", ")}`,
    );
  }

  // Important: public URL path (served by express.static)
  return `/assets/${appFile}`;
}

// Basic request logging with duration
app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(2)}ms`,
    );
  });

  next();
});

// Serve static assets from apps/bff/static
app.use(
  express.static(staticDir, {
    index: false,
    setHeaders(res, filePath) {
      const filename = path.basename(filePath);

      // Do not cache HTML entry points
      if (filename === "index.html" || filename === "404.html") {
        res.setHeader("Cache-Control", "no-store");
        return;
      }

      // Cache hashed assets aggressively
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }

      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }),
);

// APIs
app.get("/api/bootstrap", async (req, res) => {
  const route = typeof req.query.path === "string" ? req.query.path : "/";
  const ctx = buildRequestContext(req, route);

  const payload = await getBootstrapPayload(ctx);
  res.status(200).json(payload);
});

app.get("/api/todos", async (req, res) => {
  const ctx = buildRequestContext(req, "/todos");
  const http = createHttpClient({ requestId: ctx.requestId });

  try {
    const todos = await getTodos(http);
    res.status(200).json(
      todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
    );
  } catch (err) {
    console.error(
      `[todos] FAIL requestId=${ctx.requestId} userId=${ctx.userId}`,
      err,
    );
    res.status(500).json({
      code: "TODOS_FAILED",
      message: "Failed to load todos",
    });
  }
});

app.get("/api/hello", (_req, res) => {
  res.status(200).json({ message: "Hello from the node/express BFF" });
});

app.get("/api/injected", (_req, res) => {
  res.status(200).json({ message: "Hello from injected Redux state (BFF)" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// SSR handler for all non-API routes
app.get(/.*/, async (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  if (path.extname(req.path)) return next(); // real file requests can 404 normally

  const route = req.path;
  console.log(`SSR request for route: ${route}`);

  try {
    const ctx = buildRequestContext(req, route);
    const bootstrap = await getBootstrapPayload(ctx);

    const assetScriptSrc = await findClientBundleSrc();

    const html = await renderHtml({
      ctx,
      bootstrap,
      assetScriptSrc,
    });

    res.status(200).type("html").send(html);
  } catch (e) {
    next(e);
  }
});

// Fallback 404 HTML
app.use((_req, res) => {
  res.status(404).sendFile(path.join(staticDir, "404.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`BFF listening at http://localhost:${port}`);
  console.log(`Serving static from: ${staticDir}`);
});
