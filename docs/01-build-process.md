# Build Process

This document explains how the project builds from source code to runnable application.

## Overview

The build process has two main parts:

1. **Client Build** (Webpack) - Bundles React code for the browser
2. **Server Build** (TypeScript) - Compiles server code to JavaScript

```
Source Files                    Build Tools                 Output
────────────────────────────────────────────────────────────────────
apps/web/src/*.tsx     ──►     Webpack + ts-loader    ──►  apps/bff/static/
                                    │                           │
                                    │                      ├── assets/
                                    │                      │   ├── app.[hash].js
                                    │                      │   └── app.[hash].css
                                    │                      ├── index.html
                                    │                      └── manifest.json
                                    │
apps/bff/src/*.ts      ──►     TypeScript Compiler    ──►  apps/bff/dist/
packages/shared/src/*  ──►           (tsc)            ──►  packages/shared/dist/
packages/ui/src/*      ──►                            ──►  packages/ui/dist/
```

## Why This Setup?

### Client Build (Webpack)

**Why Webpack instead of just TypeScript?**

TypeScript alone can compile `.tsx` to `.js`, but we need more:

| Need | Solution |
|------|----------|
| Bundle all files into one | Webpack bundles imports into single file |
| Process CSS | css-loader and style-loader |
| Cache-bust assets | Content hashes in filenames |
| Generate HTML | HtmlWebpackPlugin |
| Development server | webpack-dev-server with HMR |
| Optimize for production | Minification, tree-shaking |

### Server Build (TypeScript)

**Why just TypeScript for the server?**

Node.js can run JavaScript directly, so we only need to:
- Convert TypeScript to JavaScript
- Preserve ES modules for Node.js

No bundling needed - Node.js handles imports at runtime.

---

## Webpack Configuration Deep Dive

**File:** `apps/web/webpack.config.cjs`

### Entry Point

```javascript
entry: {
  app: "./src/main.tsx",
}
```

**What this means:** Webpack starts at `main.tsx` and follows all `import` statements to find every file needed.

**Why "app"?** This name becomes part of the output filename: `app.[hash].js`.

### Output Configuration

```javascript
output: {
  filename: "assets/[name].[contenthash].js",
  chunkFilename: "assets/[name].[contenthash].js",
  path: path.resolve(__dirname, "../bff/static"),
  publicPath: "/",
  clean: true,
}
```

Let's break this down:

| Property | Value | Why |
|----------|-------|-----|
| `filename` | `assets/[name].[contenthash].js` | Main bundle goes to `/assets/app.abc123.js` |
| `chunkFilename` | Same pattern | Code-split chunks get same naming |
| `path` | `../bff/static` | Build directly into server's static folder |
| `publicPath` | `/` | URLs in HTML start with `/` |
| `clean` | `true` | Delete old files before each build |

**What is `[contenthash]`?**

A hash of the file's contents. If the code changes, the hash changes:
- `app.abc123.js` → `app.def456.js`

This enables aggressive caching: browsers can cache files forever because new code = new filename.

### Loaders

Loaders transform files. Webpack processes files right-to-left through loaders:

```javascript
module: {
  rules: [
    {
      test: /\.tsx?$/,           // Match .ts and .tsx files
      use: {
        loader: "ts-loader",
        options: {
          transpileOnly: true,   // Skip type checking (faster)
          configFile: "tsconfig.client.json",
        },
      },
    },
    {
      test: /\.css$/,
      use: [
        isProduction
          ? MiniCssExtractPlugin.loader  // Production: extract to file
          : "style-loader",               // Development: inject into DOM
        "css-loader",
      ],
    },
  ],
}
```

**Why `transpileOnly: true`?**

Type checking is slow. We skip it during bundling and run `tsc --noEmit` separately. This makes builds faster while still catching type errors.

**Why different CSS handling for dev/prod?**

| Mode | Loader | Behavior |
|------|--------|----------|
| Development | style-loader | Injects CSS into `<style>` tags. Enables hot reload. |
| Production | MiniCssExtractPlugin | Extracts CSS to separate file. Better caching. |

### Plugins

Plugins extend Webpack's capabilities:

```javascript
plugins: [
  // 1. Generate index.html with script tags
  new HtmlWebpackPlugin({
    template: "./src/index.html",
    filename: "index.html",
  }),

  // 2. Create manifest.json mapping names to hashed files
  new WebpackManifestPlugin({
    fileName: "manifest.json",
  }),

  // 3. Handle .js extensions in TypeScript imports
  new NormalModuleReplacementPlugin(/\.js$/, (resource) => {
    if (resource.request.startsWith(".")) {
      resource.request = resource.request.replace(/\.js$/, "");
    }
  }),

  // 4. Extract CSS in production
  isProduction && new MiniCssExtractPlugin({
    filename: "assets/[name].[contenthash].css",
  }),
].filter(Boolean)
```

#### HtmlWebpackPlugin

**What it does:** Generates `index.html` with `<script>` tags pointing to the hashed bundle.

**Why needed:** Without this, you'd have to manually update HTML every time the hash changes.

**Input template:**
```html
<!DOCTYPE html>
<html>
  <head><title>My App</title></head>
  <body>
    <div id="root"></div>
    <!-- HtmlWebpackPlugin adds script tags here -->
  </body>
</html>
```

**Output:**
```html
<!DOCTYPE html>
<html>
  <head><title>My App</title></head>
  <body>
    <div id="root"></div>
    <script src="/assets/app.abc123.js"></script>
  </body>
</html>
```

#### WebpackManifestPlugin

**What it does:** Creates `manifest.json` mapping logical names to actual filenames.

```json
{
  "app.js": "/assets/app.abc123def456.js",
  "app.css": "/assets/app.789xyz.css",
  "index.html": "/index.html"
}
```

**Why needed:** The server needs to know the current hashed filenames to inject the correct `<script>` tags during SSR.

#### NormalModuleReplacementPlugin

**What it does:** Removes `.js` extensions from imports.

**Why needed:** TypeScript requires `.js` extensions in imports (for ESM compatibility), but the actual files are `.ts`. This plugin strips the extension so Webpack can find the right file.

```typescript
// In code: import { foo } from "./utils.js"
// Plugin converts to: import { foo } from "./utils"
// Webpack finds: ./utils.ts or ./utils.tsx
```

### Development Server

```javascript
devServer: {
  host: "0.0.0.0",        // Accept connections from any IP
  port: 8080,
  hot: true,              // Enable Hot Module Replacement
  historyApiFallback: true, // Return index.html for all routes

  proxy: [
    {
      context: ["/api"],
      target: process.env.DOCKER === "true"
        ? "http://bff:3000"
        : "http://localhost:3000",
    },
  ],
}
```

**Why `host: "0.0.0.0"`?**

By default, servers only accept connections from `localhost`. Setting `0.0.0.0` allows connections from anywhere - needed for Docker containers to communicate.

**Why `historyApiFallback`?**

With client-side routing, URLs like `/about` don't have actual files. This setting returns `index.html` for any URL, letting React Router handle routing.

**Why proxy?**

During development, the client runs on port 8080 but APIs are on port 3000. The proxy forwards `/api/*` requests to the BFF server.

---

## Static Assets (public/ folder)

Static files that should be included in the build but not processed by webpack go in `apps/web/public/`:

```
apps/web/public/
├── 404.html      # Custom 404 page
├── favicon.ico   # Site icon (if needed)
└── robots.txt    # Search engine instructions (if needed)
```

These files are copied to the output directory by `copy-webpack-plugin` after webpack cleans the directory.

**Why not put them directly in `apps/bff/static/`?**

Webpack's `clean: true` option deletes everything in the output directory before each build. Files in `public/` are copied after the clean, so they survive rebuilds.

**Configuration:** `apps/web/webpack.config.cjs`

```javascript
new CopyWebpackPlugin({
  patterns: [
    {
      from: path.resolve(__dirname, "public"),
      to: ".",
      noErrorOnMissing: true,
    },
  ],
}),
```

---

## Build Commands

### Development

```bash
npm run dev:web    # Starts webpack-dev-server on :8080
npm run dev:bff    # Starts BFF server on :3000
npm run dev        # Runs both in parallel
```

### Production

```bash
npm run build      # Builds all packages in dependency order
npm start          # Runs production server
```

### Build Order

```bash
npm run build -w @restart/shared   # 1. Shared types first
npm run build -w @restart/ui       # 2. UI components (depends on shared)
npm run build -w @restart/web      # 3. Client bundle (depends on ui)
npm run build -w @restart/bff      # 4. Server (depends on ui for SSR)
```

**Why this order?**

Each package depends on the previous. If you build `ui` before `shared`, it will fail because `shared` types don't exist yet.

---

## Gotchas and Common Mistakes

### 1. Forgetting to Build Shared Packages

**Symptom:** "Cannot find module '@restart/shared'"

**Fix:** Run `npm run build` from root, or build packages in order.

### 2. Old Build Artifacts

**Symptom:** Changes don't appear after building

**Fix:** The `clean: true` option should handle this, but you can manually delete `dist/` folders:

```bash
rm -rf apps/bff/dist apps/bff/static/assets packages/*/dist
npm run build
```

### 3. TypeScript Errors Not Showing in Webpack

**Symptom:** Code builds but has type errors

**Reason:** `transpileOnly: true` skips type checking for speed.

**Fix:** Run type checking separately:

```bash
npx tsc --noEmit    # Check all projects
```

### 4. CSS Not Hot Reloading

**Symptom:** CSS changes require page refresh

**Reason:** Usually happens if `style-loader` isn't being used (production mode).

**Fix:** Ensure `NODE_ENV !== 'production'` during development.

---

## Potential Improvements

### 1. Enable Type Checking in CI

```yaml
# .github/workflows/ci.yml
- name: Type Check
  run: npx tsc --noEmit
```

### 2. Add Bundle Analysis

The config includes BundleAnalyzerPlugin. Run with:

```bash
ANALYZE=true npm run build -w @restart/web
```

### 3. Consider esbuild-loader

Replace ts-loader with esbuild-loader for faster builds:

```javascript
{
  test: /\.tsx?$/,
  loader: "esbuild-loader",
  options: {
    loader: "tsx",
    target: "es2022",
  },
}
```

Trade-off: Faster builds, but slightly less compatible with edge-case TypeScript features.

### 4. Add Source Maps for Production Debugging

```javascript
devtool: isProduction ? "source-map" : "eval-source-map",
```

This generates `.map` files for production debugging (don't serve these publicly).
