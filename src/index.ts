import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getPort } from "./env.js";
import fs from "fs/promises";
import { buildRequestContext } from "./server/requestContext.js";
import { getBootstrapPayload, getTodos } from "./server/bootstrap.js";
import { createHttpClient } from "./server/httpClient.js";
import { renderHtml } from "./server/ssr/render.js";

const app = express();
const port = getPort();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, "..");
const staticDir = path.join(projectRoot, "static");

async function findClientBundleSrc(): Promise<string> {
  const assetsDir = path.join(staticDir, "assets");
  const files = await fs.readdir(assetsDir);
  const appFile = files.find((f) => f.startsWith("app.") && f.endsWith(".js"));
  if (!appFile)
    throw new Error("Could not find built app bundle in static/assets");
  return `/assets/${appFile}`;
}

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    // express's res.on('finish') event fires when the response is done being sent so we can measure total request duration
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(
        2,
      )}ms`,
    );
  });

  next();
});

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

      // Cache hashed assets aggressively, Hashed assets are safe to cache "forever"
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }

      // Default for other files
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }),
);

app.get("/api/bootstrap", async (req, res) => {
  const route = typeof req.query.path === "string" ? req.query.path : "/";
  const ctx = buildRequestContext(req, route);

  // In dev, we allow the client to pass the route it is on
  // because req.path will be "/api/bootstrap"
  const payload = await getBootstrapPayload(ctx);

  console.log(payload);

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

app.get("/api/hello", (req, res) => {
  res.status(200).json({
    message: "Hello from the node/express BFF",
  });
});

app.get("/api/injected", (req, res) => {
  res.status(200).json({
    message: "Hello from injected Redux state (BFF)",
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// server/index.ts
app.get(/.*/, async (req, res, next) => {
  if (req.path.startsWith("/api")) return next();

  // Let real file requests 404 (assets, favicon, etc.)
  if (path.extname(req.path)) return next();

  const route = req.path;
  console.log(`SSR request for route: ${route}`);

  try {
    const ctx = buildRequestContext(req, route);
    const bootstrap = await getBootstrapPayload(ctx);

    // If prod build exists, SSR. If not, fall back to index.html injection.
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

app.use((req, res) => {
  res.status(404).sendFile(path.join(path.join(staticDir, "404.html")));
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
