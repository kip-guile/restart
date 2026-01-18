/**
 * @fileoverview Webpack configuration for the web application
 *
 * WHAT IS WEBPACK?
 * Webpack is a "bundler" - it takes all your JavaScript/TypeScript files and
 * combines them into one or more optimized files for the browser. It also
 * handles CSS, images, and other assets.
 *
 * WHY WE USE WEBPACK:
 * 1. BUNDLING - Combines hundreds of files into a few optimized bundles
 * 2. TRANSPILATION - Converts TypeScript to JavaScript via ts-loader
 * 3. CODE SPLITTING - Can split code into chunks for lazy loading
 * 4. ASSET HASHING - Adds content hashes to filenames for cache busting
 * 5. DEV SERVER - Provides hot reload during development
 *
 * BUILD OUTPUT:
 * - assets/app.[contenthash].js - Main JavaScript bundle
 * - assets/app.[contenthash].css - Extracted CSS (production only)
 * - index.html - HTML with script/style tags injected
 * - manifest.json - Maps entry names to actual filenames (for SSR)
 *
 * THE MANIFEST FILE (manifest.json):
 * When we build, filenames include content hashes like "app.3f2a91c0.js".
 * This is great for caching (change content = new hash = browser fetches new file).
 *
 * But the server needs to know the current filename to inject the right <script> tag.
 * The manifest.json file provides this mapping:
 * {
 *   "app.js": "/assets/app.3f2a91c0.js",
 *   "app.css": "/assets/app.abc123.css"
 * }
 *
 * The server reads this file instead of scanning the directory for files.
 * This is more reliable and faster than pattern matching filenames.
 */

const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");

// Conditionally load bundle analyzer (only when ANALYZE=true)
let BundleAnalyzerPlugin;
if (process.env.ANALYZE === "true") {
  ({ BundleAnalyzerPlugin } = require("webpack-bundle-analyzer"));
}

module.exports = (_env, argv) => {
  // Determine if this is a production build
  const isProd = argv.mode === "production";

  // API proxy target - different for Docker vs local development
  // Docker uses container networking (bff:3000), local uses localhost
  const apiTarget =
    process.env.DOCKER === "true"
      ? "http://bff:3000"
      : "http://localhost:3000";

  return {
    // ========================================================================
    // ENTRY POINT
    // ========================================================================
    /**
     * The starting file for webpack to begin bundling.
     * Webpack follows all imports from this file to build the dependency graph.
     *
     * We name it "app" which becomes the [name] in output filenames.
     */
    entry: {
      app: path.resolve(__dirname, "src/main.tsx"),
    },

    // ========================================================================
    // OUTPUT CONFIGURATION
    // ========================================================================
    /**
     * Where and how to write the bundled files.
     *
     * We output directly to the BFF's static folder so Express can serve them.
     * In a larger project, you might output to a separate dist/ folder and
     * copy files during deployment.
     */
    output: {
      // Output to the BFF's static folder
      path: path.resolve(__dirname, "../bff/static"),

      // Filename pattern: assets/app.3f2a91c0.js
      // [name] = entry name (app)
      // [contenthash] = hash of file contents (changes when code changes)
      filename: "assets/[name].[contenthash].js",

      // Same pattern for dynamically imported chunks (code splitting)
      chunkFilename: "assets/[name].[contenthash].js",

      // Base path for all assets (used in HTML for script/link tags)
      publicPath: "/",

      // Clean old files in production (prevents hash files piling up)
      clean: isProd,
    },

    // ========================================================================
    // MODULE RESOLUTION
    // ========================================================================
    /**
     * How webpack resolves import statements.
     *
     * extensions: Allows importing without file extensions
     * import "./App" finds ./App.tsx, ./App.ts, or ./App.js
     */
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },

    // ========================================================================
    // LOADERS (MODULE RULES)
    // ========================================================================
    /**
     * Loaders transform files before bundling.
     *
     * Each rule has:
     * - test: Regex to match file paths
     * - use: Loader(s) to apply
     * - exclude: Paths to skip
     */
    module: {
      rules: [
        // TypeScript/TSX files - use ts-loader
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader",
            options: {
              // Use our client-specific tsconfig
              configFile: path.resolve(__dirname, "tsconfig.client.json"),
              // transpileOnly skips type checking for faster builds
              // Type errors are caught by IDE and CI type-check step
              transpileOnly: true,
            },
          },
          exclude: /node_modules/,
        },

        // CSS files
        {
          test: /\.css$/,
          use: [
            // In production: extract CSS to separate file
            // In development: inject CSS via JavaScript (for hot reload)
            isProd ? MiniCssExtractPlugin.loader : "style-loader",
            "css-loader",
          ],
        },
      ],
    },

    // ========================================================================
    // PLUGINS
    // ========================================================================
    /**
     * Plugins extend webpack's functionality.
     * Unlike loaders (which transform files), plugins can do almost anything.
     */
    plugins: [
      // HtmlWebpackPlugin - Generates index.html with correct script tags
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "src/index.html"),
        filename: "index.html",
      }),

      // WebpackManifestPlugin - Generates manifest.json mapping
      // This is how the server knows which hashed filename to use
      new WebpackManifestPlugin({
        fileName: "manifest.json",
        publicPath: "/",
        // Generate clean keys like "app.js" instead of full paths
        generate: (seed, files) => {
          const manifest = {};
          files.forEach((file) => {
            // Map "app.js" -> "/assets/app.abc123.js"
            manifest[file.name] = file.path;
          });
          return manifest;
        },
      }),

      // MiniCssExtractPlugin - Extracts CSS to separate files (production only)
      ...(isProd
        ? [
            new MiniCssExtractPlugin({
              filename: "assets/[name].[contenthash].css",
            }),
          ]
        : []),

      // BundleAnalyzerPlugin - Visualize bundle size (when ANALYZE=true)
      ...(process.env.ANALYZE === "true" ? [new BundleAnalyzerPlugin()] : []),

      /**
       * NormalModuleReplacementPlugin - Handle .js extensions in TypeScript
       *
       * WHY THIS IS NEEDED:
       * TypeScript with NodeNext module resolution requires .js extensions
       * in imports, even for .ts files. This is because TS outputs .js files.
       *
       * But webpack doesn't know about this convention. This plugin intercepts
       * .js imports and checks if a .ts or .tsx file exists instead.
       *
       * Example:
       * import { App } from "./App.js"  // In source code
       * Webpack looks for: ./App.js (doesn't exist)
       * This plugin redirects to: ./App.tsx (exists!)
       */
      new webpack.NormalModuleReplacementPlugin(/\.js$/, (resource) => {
        try {
          const req = resource.request;
          if (!req) return;

          // Only handle relative imports
          if (req.startsWith("./") || req.startsWith("../")) {
            const tsPath = path.resolve(
              resource.context,
              req.replace(/\.js$/, ".ts")
            );
            const tsxPath = path.resolve(
              resource.context,
              req.replace(/\.js$/, ".tsx")
            );

            // Prefer .ts, fall back to .tsx
            if (fs.existsSync(tsPath)) {
              resource.request = req.replace(/\.js$/, ".ts");
            } else if (fs.existsSync(tsxPath)) {
              resource.request = req.replace(/\.js$/, ".tsx");
            }
          }
        } catch {
          // Silently ignore errors - let webpack handle missing files
        }
      }),
    ],

    // ========================================================================
    // SOURCE MAPS
    // ========================================================================
    /**
     * Source maps connect bundled code back to original source.
     * Essential for debugging but adds to bundle size.
     *
     * - Development: Full source maps for easy debugging
     * - Production: Disabled (or use 'hidden-source-map' for error tracking)
     */
    devtool: isProd ? false : "source-map",

    // ========================================================================
    // DEVELOPMENT SERVER
    // ========================================================================
    /**
     * webpack-dev-server provides:
     * - Hot Module Replacement (HMR) - Update code without full reload
     * - Proxy - Forward API requests to the BFF
     * - History fallback - Serve index.html for client-side routing
     */
    devServer: {
      host: "0.0.0.0", // Listen on all interfaces (needed for Docker)
      port: 8080,
      hot: true, // Enable hot module replacement
      open: false, // Don't auto-open browser

      // For client-side routing: serve index.html for all routes
      historyApiFallback: true,

      // Proxy API requests to the BFF server
      // /api/* -> http://localhost:3000/api/*
      proxy: [
        {
          context: ["/api"],
          target: apiTarget,
          changeOrigin: true,
        },
      ],
    },
  };
};
