import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getPort } from "./env.js";

const app = express();
const port = getPort();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, "..");
const staticDir = path.join(projectRoot, "static");

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

app.get("/api/hello", (req, res) => {
  res.status(200).json({
    message: "Hello from the BFF",
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

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api")) return next();

  // If the request looks like a file request (has an extension), let it 404
  // Example: /assets/app.123.js or /favicon.ico
  if (path.extname(req.path)) return next();

  res.sendFile(path.join(staticDir, "index.html"));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(path.join(staticDir, "404.html")));
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
