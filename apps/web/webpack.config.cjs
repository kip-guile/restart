const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

let BundleAnalyzerPlugin;
if (process.env.ANALYZE === "true") {
  ({ BundleAnalyzerPlugin } = require("webpack-bundle-analyzer"));
}
const MiniCssExtractPlugin = require("mini-css-extract-plugin");


module.exports = (_env, argv) => {
  const isProd = argv.mode === "production";
  const apiTarget = process.env.DOCKER === "true"
  ? "http://bff:3000"
  : "http://localhost:3000";

  return {
    entry: { // the starting file. Webpack walks imports from here.
      app: path.resolve(__dirname, "src/main.tsx")
    },

    output: { // where built files go. We output straight into static/ folder so Express can serve them.
      path: path.resolve(__dirname, "../bff/static"),
      filename: "assets/[name].[contenthash].js", // this creates hashed assets. Example assets/app.3f2a91c0.js.
      chunkFilename: "assets/[name].[contenthash].js", // for code-split chunks.
      publicPath: "/",
      clean: isProd // production build cleans old hashed files so they do not pile up.
    },

    resolve: {
      extensions: [".tsx", ".ts", ".js"] // allows imports without specifying these extensions
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader", // converts TypeScript to JS for bundling.
            options: {
            configFile: path.resolve(__dirname, "tsconfig.client.json"),
            transpileOnly: true // enables type checking during the build.
            },
          },
          exclude: /node_modules/
        },
        {
            test: /\.css$/,
            use: [isProd ? MiniCssExtractPlugin.loader : "style-loader", "css-loader"]
        }
      ]
    },

    plugins: [
      new HtmlWebpackPlugin({ // takes template HTML and writes static/index.html with the correct script tag injected.
        template: path.resolve(__dirname, "src/index.html"),
        filename: "index.html"
      }),
    ...(process.env.ANALYZE === "true" ? [new BundleAnalyzerPlugin()] : []), // conditionally add bundle analyzer plugin based on env var
    ...(isProd
        ? [
            new MiniCssExtractPlugin({
                filename: "assets/[name].[contenthash].css"
            })
            ]
        : []),
        new webpack.NormalModuleReplacementPlugin(/\.js$/, (resource) => {
        try {
          const req = resource.request;
          if (!req) return;
          if (req.startsWith("./") || req.startsWith("../")) {
            const tsPath = path.resolve(resource.context, req.replace(/\.js$/, ".ts"));
            const tsxPath = path.resolve(resource.context, req.replace(/\.js$/, ".tsx"));
            if (fs.existsSync(tsPath)) resource.request = req.replace(/\.js$/, ".ts");
            else if (fs.existsSync(tsxPath)) resource.request = req.replace(/\.js$/, ".tsx");
          }
        } catch {
          // noop
        }
      }),
    ],

    devtool: isProd ? false : "source-map", // source maps in dev, none in prod.

    devServer: { // dev server for local development.
      host: "0.0.0.0",
      port: 8080,
      hot: true,
      open: false,
      historyApiFallback: true,
    //   static: {
    //     directory: path.resolve(__dirname, "static") // serves files that are actually on disk (like 404.html for now)
    //     // In dev, Webpack serves your bundle from memory, not from static/assets on disk, but it still behaves like the browser got real files
    //   },
      // proxy API requests to the BFF server
        proxy: [
            {
                context: ["/api"],
                target: apiTarget,
                changeOrigin: true
            }
        ]
    }
  };
};
