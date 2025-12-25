import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    files: ["eslint.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // 1) Ignore build output
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  // 1) Base JS linting for CommonJS files
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // 2) Base JS linting (applies to JS files like eslint.config.js)
  js.configs.recommended,

  // 3) TypeScript linting only for TS files
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
    languageOptions: {
      ...(config.languageOptions ?? {}),
      globals: {
        ...globals.node,
      },
      parserOptions: {
        // point to both tsconfig files so eslint can understand paths and settings from both, stops the “document is error typed” issues and keeps server and client correct.
        project: ["./tsconfig.server.json", "./tsconfig.client.json"],
        tsconfigRootDir: process.cwd(),
      },
    },
  })),

  // 4) Prettier integration
  prettierConfig,
  {
    files: ["**/*.{ts,js}"],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },
];
