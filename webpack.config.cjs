const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");


module.exports = (_env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: { // the starting file. Webpack walks imports from here.
      app: path.resolve(__dirname, "src/client/main.tsx")
    },

    output: { // where built files go. We output straight into static/ folder so Express can serve them.
      path: path.resolve(__dirname, "static"),
      filename: "assets/[name].[contenthash].js", // this creates hashed assets. Example assets/app.3f2a91c0.js.
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
            configFile: "tsconfig.client.json", // points to the client-specific tsconfig.
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
        template: path.resolve(__dirname, "src/client/index.html"),
        filename: "index.html"
      }),
    ...(process.env.ANALYZE === "true" ? [new BundleAnalyzerPlugin()] : []), // conditionally add bundle analyzer plugin based on env var
    ...(isProd
        ? [
            new MiniCssExtractPlugin({
                filename: "assets/[name].[contenthash].css"
            })
            ]
        : [])
    ],

    devtool: isProd ? false : "source-map", // source maps in dev, none in prod.

    devServer: { // dev server for local development.
      port: 8080,
      hot: true,
      open: true,
      historyApiFallback: true,
    //   static: {
    //     directory: path.resolve(__dirname, "static") // serves files that are actually on disk (like 404.html for now)
    //     // In dev, Webpack serves your bundle from memory, not from static/assets on disk, but it still behaves like the browser got real files
    //   },
      // proxy API requests to the BFF server
        proxy: [
            {
                context: ["/api"],
                target: "http://localhost:3000",
                changeOrigin: true
            }
        ]
    }
  };
};
