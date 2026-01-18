# TypeScript Setup

This document explains how TypeScript is configured across the monorepo.

## Overview

TypeScript configuration is split across multiple files:

```
restart/
├── tsconfig.base.json         # Shared settings for all packages
├── apps/
│   ├── bff/tsconfig.server.json   # Server-specific settings
│   └── web/tsconfig.client.json   # Client-specific settings
└── packages/
    ├── shared/tsconfig.json       # Shared package settings
    └── ui/tsconfig.json           # UI package settings
```

**Why multiple configs?**

Different environments need different settings:
- Browser code needs DOM types
- Node code needs different module resolution
- Shared packages need to emit declaration files

## Base Configuration

**File:** `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "incremental": true,
    "paths": {
      "@restart/shared": ["./packages/shared/src"],
      "@restart/ui": ["./packages/ui/src"]
    },
    "baseUrl": "."
  }
}
```

Let's understand each option:

### Compilation Target

```json
"target": "ES2022",
"lib": ["ES2022"]
```

| Option | Meaning |
|--------|---------|
| `target` | Output JavaScript version. ES2022 is well-supported in modern browsers and Node 18+. |
| `lib` | Built-in types to include. ES2022 includes Promise, Array methods, etc. |

**Why ES2022?**

It's a good balance between modern features (top-level await, class fields) and compatibility.

### Strict Mode Settings

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true
```

**`strict: true`** enables all strict checks:

| Check | What It Catches |
|-------|-----------------|
| `strictNullChecks` | Variables might be `null` or `undefined` |
| `strictFunctionTypes` | Function parameter types must match exactly |
| `strictBindCallApply` | `bind`, `call`, `apply` are type-checked |
| `strictPropertyInitialization` | Class properties must be initialized |
| `noImplicitAny` | Must explicitly type `any` |
| `noImplicitThis` | `this` must have a known type |
| `useUnknownInCatchVariables` | Catch variables are `unknown`, not `any` |
| `alwaysStrict` | Emit `"use strict"` in output |

**`noUncheckedIndexedAccess`** - Often forgotten, very valuable:

```typescript
const arr = [1, 2, 3];

// Without noUncheckedIndexedAccess:
const item = arr[10];  // Type: number (wrong! it's undefined)

// With noUncheckedIndexedAccess:
const item = arr[10];  // Type: number | undefined (correct!)
```

**`exactOptionalPropertyTypes`** - Distinguishes "missing" from "explicitly undefined":

```typescript
type User = {
  name: string;
  nickname?: string;  // Optional property
};

// Without exactOptionalPropertyTypes:
const user: User = { name: "Alex", nickname: undefined };  // OK

// With exactOptionalPropertyTypes:
const user: User = { name: "Alex", nickname: undefined };  // ERROR!
// You must either omit the property or provide a string
```

### Declaration Files

```json
"declaration": true,
"declarationMap": true
```

| Option | Effect |
|--------|--------|
| `declaration` | Generate `.d.ts` files alongside `.js` |
| `declarationMap` | Generate source maps for declarations |

**Why needed?**

When `packages/ui` imports `packages/shared`, TypeScript needs type information. Declaration files provide this.

```
packages/shared/dist/
├── index.js          # Runtime code
├── index.d.ts        # Type definitions
└── index.d.ts.map    # Source map for "Go to Definition"
```

### Project References

```json
"composite": true,
"incremental": true
```

These enable TypeScript's project references feature:

| Option | Effect |
|--------|--------|
| `composite` | Makes this a "project" other projects can reference |
| `incremental` | Cache build information for faster rebuilds |

**How it works:**

```
packages/ui/tsconfig.json can say:
{
  "references": [
    { "path": "../shared" }
  ]
}
```

Then `tsc --build` builds dependencies first automatically.

### Path Aliases

```json
"paths": {
  "@restart/shared": ["./packages/shared/src"],
  "@restart/ui": ["./packages/ui/src"]
},
"baseUrl": "."
```

**What this enables:**

```typescript
// Instead of:
import { Todo } from "../../packages/shared/src/types";

// You can write:
import { Todo } from "@restart/shared";
```

**Important:** These paths are for TypeScript only! The actual resolution at runtime depends on:
- Webpack (for client code) - handles via configuration
- Node.js (for server code) - uses `package.json` exports

---

## Client Configuration

**File:** `apps/web/tsconfig.client.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

### Client-Specific Settings

**`lib: ["ES2022", "DOM"]`**

Adds DOM types (`document`, `window`, `HTMLElement`, etc.) for browser code.

**`jsx: "react-jsx"`**

Uses the new JSX transform (React 17+). No need to `import React` in every file:

```tsx
// Old way (jsx: "react"):
import React from "react";
function App() { return <div>Hi</div>; }

// New way (jsx: "react-jsx"):
function App() { return <div>Hi</div>; }  // No import needed!
```

**`module: "ESNext"`**

Keep ES modules as-is. Don't convert to CommonJS. Webpack handles module bundling.

**`moduleResolution: "Bundler"`**

Use bundler-style resolution. This mode:
- Allows importing without extensions
- Supports `exports` field in package.json
- Matches how Webpack resolves modules

**`noEmit: true`**

Don't output any files. Webpack + ts-loader handles compilation. This config is only for type checking and IDE support.

---

## Server Configuration

**File:** `apps/bff/tsconfig.server.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"]
}
```

### Server-Specific Settings

**`lib: ["ES2022", "DOM"]`**

Wait, why DOM on the server? For SSR! React's `renderToString` uses some DOM types.

**`module: "NodeNext"`** and **`moduleResolution: "NodeNext"`**

Use Node.js native ES modules:
- Respects `"type": "module"` in package.json
- Requires file extensions in imports
- Supports `exports` field in package.json

**`outDir: "dist"`**

Output compiled JavaScript to `dist/` folder.

**`verbatimModuleSyntax: true`**

Preserve import/export syntax exactly as written. Important for proper ESM output.

```typescript
// Input:
import type { Foo } from "./types.js";
import { bar } from "./utils.js";

// With verbatimModuleSyntax:
// Type imports are completely removed
// Value imports stay as ES imports
```

---

## Shared Package Configuration

**File:** `packages/shared/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Why `Bundler` resolution for shared packages?**

Shared code is used by both:
- Client (bundled by Webpack)
- Server (run by Node.js)

`Bundler` resolution is the most compatible for both use cases.

---

## Type Organization

Types are organized in `packages/shared/src/types/`:

```
packages/shared/src/types/
├── index.ts        # Re-exports all types
└── bootstrap.ts    # Bootstrap-related types
```

### The Bootstrap Types

```typescript
// packages/shared/src/types/bootstrap.ts

/**
 * A todo item from the external API.
 */
export type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

/**
 * Bootstrap payload - discriminated union by page.kind
 */
export type BootstrapPayload =
  | { route: string; greeting: string; page: { kind: "home" } }
  | { route: string; greeting: string; page: { kind: "todos"; todos: Todo[] } }
  | { route: string; greeting: string; page: { kind: "error"; status: number; code: string; message: string } };
```

**Why a discriminated union?**

TypeScript can narrow the type based on `page.kind`:

```typescript
function handleBootstrap(payload: BootstrapPayload) {
  switch (payload.page.kind) {
    case "home":
      // TypeScript knows: payload.page is { kind: "home" }
      break;
    case "todos":
      // TypeScript knows: payload.page has todos array
      console.log(payload.page.todos);
      break;
    case "error":
      // TypeScript knows: payload.page has error details
      console.log(payload.page.message);
      break;
  }
}
```

---

## Common Issues and Fixes

### 1. "Cannot find module '@restart/shared'"

**Cause:** Shared package isn't built yet.

**Fix:**
```bash
npm run build -w @restart/shared
```

### 2. "File is not under 'rootDir'"

**Cause:** Importing a file outside the configured source directory.

**Fix:** Check that imports go through the package's public API:
```typescript
// Wrong: Direct path outside rootDir
import { foo } from "../../packages/shared/src/utils";

// Right: Through package name
import { foo } from "@restart/shared";
```

### 3. Extension Mismatch

**Cause:** Server requires `.js` extensions, client doesn't want them.

**Fix:** Always use `.js` extensions in shared code. Webpack strips them (via plugin), Node.js uses them.

```typescript
// In packages/shared/src/utils/index.ts
export * from "./http.js";  // Use .js even though file is .ts
export * from "./sleep.js";
```

### 4. "Type 'X' is not assignable to type 'Y'"

Often caused by `exactOptionalPropertyTypes`. You can't assign `undefined` to optional properties:

```typescript
type Config = { timeout?: number };

// Error with exactOptionalPropertyTypes:
const config: Config = { timeout: undefined };

// Fix - omit the property:
const config: Config = {};

// Or if you need to explicitly clear it:
const config: Config = { timeout: undefined as never };
```

---

## Alternative Approaches

### 1. Single tsconfig with Project References

Instead of `extends`, use project references exclusively:

```json
// tsconfig.json (root)
{
  "references": [
    { "path": "./packages/shared" },
    { "path": "./packages/ui" },
    { "path": "./apps/web" },
    { "path": "./apps/bff" }
  ]
}
```

Then build with `tsc --build`.

**Trade-off:** More explicit, but requires all packages to be TypeScript projects.

### 2. paths vs package.json exports

Instead of `paths` in tsconfig, use `exports` in package.json:

```json
// packages/shared/package.json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

**Trade-off:** Works at runtime without bundler config, but IDE support can be trickier.

### 3. Stricter Settings to Consider

```json
{
  "compilerOptions": {
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedSideEffectImports": true
  }
}
```

| Option | Effect |
|--------|--------|
| `noPropertyAccessFromIndexSignature` | Require `obj["key"]` not `obj.key` for index signatures |
| `noUncheckedSideEffectImports` | Warn about imports that might not exist |
