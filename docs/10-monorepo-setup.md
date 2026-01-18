# Monorepo Setup

This document explains how the monorepo is organized using npm workspaces.

## Overview

A **monorepo** is a single repository containing multiple packages or applications. This project contains:

```
restart/
├── apps/                    # Deployable applications
│   ├── bff/                 # Backend-for-Frontend server
│   └── web/                 # Frontend entry point
├── packages/                # Shared libraries
│   ├── shared/              # Types and utilities
│   └── ui/                  # React components and state
├── package.json             # Root workspace configuration
└── tsconfig.base.json       # Shared TypeScript config
```

### Why a Monorepo?

| Separate Repos | Monorepo |
|----------------|----------|
| Publish packages to npm | Import directly between packages |
| Version compatibility issues | Always using latest code |
| Duplicate setup (ESLint, Prettier) | Shared configuration |
| Multiple CI/CD pipelines | Single pipeline |
| Hard to refactor across packages | Easy cross-package changes |

---

## npm Workspaces

npm workspaces let you manage multiple packages in one repo. Configure in root `package.json`:

```json
{
  "name": "restart",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

### How Workspaces Work

1. **Single `node_modules`**: Dependencies installed at root
2. **Symlinked packages**: Local packages linked, not copied
3. **Hoisted dependencies**: Shared deps at root, unique deps in package

```
restart/
├── node_modules/
│   ├── react/               # Shared dependency (hoisted)
│   ├── express/             # Only used by bff
│   ├── @restart/shared/     # Symlink → packages/shared
│   └── @restart/ui/         # Symlink → packages/ui
├── apps/bff/
│   └── (no node_modules)    # Uses root
├── apps/web/
│   └── (no node_modules)
└── packages/shared/
    └── (no node_modules)
```

---

## Package Structure

### Root Package

**File:** `package.json`

```json
{
  "name": "restart",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev:bff & npm run dev:web",
    "dev:bff": "npm run dev -w @restart/bff",
    "dev:web": "npm run dev -w @restart/web",
    "build": "npm run build -w @restart/shared && npm run build -w @restart/ui && npm run build -w @restart/web && npm run build -w @restart/bff",
    "start": "npm run start -w @restart/bff",
    "lint": "npm run lint -ws",
    "format": "npm run format -ws"
  }
}
```

### Key Root Scripts

| Script | What It Does |
|--------|--------------|
| `dev` | Runs both servers in parallel |
| `build` | Builds all packages in dependency order |
| `lint` | Lints all workspaces (`-ws` flag) |
| `-w @restart/bff` | Runs command in specific workspace |

### packages/shared

**File:** `packages/shared/package.json`

```json
{
  "name": "@restart/shared",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  }
}
```

**Contents:** Types (`Todo`, `BootstrapPayload`) and utilities (`fetchJson`, `sleep`)

**Used by:** Both `bff` and `ui`

### packages/ui

**File:** `packages/ui/package.json`

```json
{
  "name": "@restart/ui",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@restart/shared": "file:../shared",
    "react": "^19.1.0",
    "react-redux": "^9.2.0",
    "@reduxjs/toolkit": "^2.8.2",
    "react-router-dom": "^7.6.1"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

**Contents:** React components, Redux store, RTK Query API

**Used by:** Both `bff` (for SSR) and `web` (for client)

### apps/bff

**File:** `apps/bff/package.json`

```json
{
  "name": "@restart/bff",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@restart/shared": "file:../../packages/shared",
    "@restart/ui": "file:../../packages/ui",
    "express": "^5.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.server.json",
    "start": "node dist/index.js"
  }
}
```

**What it does:** Express server with SSR and API routes

### apps/web

**File:** `apps/web/package.json`

```json
{
  "name": "@restart/web",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@restart/shared": "file:../../packages/shared",
    "@restart/ui": "file:../../packages/ui",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "webpack": "^5.104.1",
    "webpack-cli": "^6.0.1",
    "webpack-dev-server": "^5.2.1"
  },
  "scripts": {
    "dev": "webpack serve --mode development",
    "build": "webpack --mode production"
  }
}
```

**What it does:** Client-side entry point, bundled by Webpack

---

## Dependency Management

### Local Dependencies

Use `file:` protocol for local packages:

```json
{
  "dependencies": {
    "@restart/shared": "file:../../packages/shared"
  }
}
```

**Why `file:` instead of `workspace:`?**

npm uses `file:` for local packages. The `workspace:` protocol is a pnpm/yarn feature that npm doesn't support.

### Peer Dependencies

Packages that should be provided by the consumer:

```json
{
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

**Why?** Ensures only one copy of React exists. Multiple React instances cause hooks to fail.

### Hoisting

npm hoists shared dependencies to root:

```
restart/
└── node_modules/
    └── react/       # One copy, shared by all packages
```

This saves disk space and ensures version consistency.

---

## Build Order

Packages must be built in dependency order:

```
1. @restart/shared    # No dependencies
        ↓
2. @restart/ui        # Depends on shared
        ↓
3. @restart/web       # Depends on ui
        ↓
4. @restart/bff       # Depends on ui
```

The root `build` script handles this:

```json
{
  "scripts": {
    "build": "npm run build -w @restart/shared && npm run build -w @restart/ui && npm run build -w @restart/web && npm run build -w @restart/bff"
  }
}
```

### Why Sequential?

If `ui` builds before `shared`, it can't find `@restart/shared` types:

```
Error: Cannot find module '@restart/shared' or its corresponding type declarations
```

---

## Importing Between Packages

### From Shared Package

```typescript
// In packages/ui/src/store/appSlice.ts
import type { BootstrapPayload } from "@restart/shared";
```

### From UI Package

```typescript
// In apps/bff/src/server/ssr/render.tsx
import { App, makeStore, applyBootstrapToStore } from "@restart/ui";
```

### How Resolution Works

1. TypeScript sees `@restart/shared`
2. Checks `tsconfig.json` paths (for types in development)
3. Node/bundler resolves via `node_modules/@restart/shared`
4. Finds symlink → `packages/shared`
5. Uses `main`/`exports` field to find entry point

---

## Development Workflow

### Making Changes to Shared Code

**Without watch mode:**
```bash
# 1. Edit packages/shared/src/types/bootstrap.ts
# 2. Rebuild shared
npm run build -w @restart/shared
# 3. Rebuild dependents
npm run build -w @restart/ui
# 4. Changes appear in app
```

**With watch mode:**
```bash
# Terminal 1: Watch shared
npm run dev -w @restart/shared

# Terminal 2: Watch ui
npm run dev -w @restart/ui

# Terminal 3: Run app
npm run dev
```

### Adding a New Package

1. Create directory structure:
```bash
mkdir -p packages/new-pkg/src
```

2. Create `package.json`:
```json
{
  "name": "@restart/new-pkg",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

3. Create `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

4. Install dependencies:
```bash
npm install  # Re-links workspaces
```

### Adding Dependencies

```bash
# Add to specific workspace
npm install lodash -w @restart/bff

# Add to root (shared tooling)
npm install -D eslint

# Add to all workspaces
npm install -ws some-package
```

---

## Package Exports

Modern Node.js uses the `exports` field for module resolution:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./utils": {
      "types": "./dist/utils/index.d.ts",
      "import": "./dist/utils/index.js"
    }
  }
}
```

This enables:
```typescript
import { Todo } from "@restart/shared";        // Main export
import { sleep } from "@restart/shared/utils"; // Subpath export
```

---

## Common Issues

### 1. "Cannot find module"

**Symptom:** Import fails for local package

**Causes:**
- Package not built
- Symlink not created

**Fix:**
```bash
# Rebuild everything
npm run build

# Or reinstall to recreate symlinks
rm -rf node_modules
npm install
```

### 2. Duplicate React Instances

**Symptom:** "Invalid hook call" error

**Cause:** Multiple React copies in node_modules

**Fix:** Ensure React is a peer dependency, not regular dependency:
```json
{
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

### 3. Type Errors After Changes

**Symptom:** TypeScript shows errors for code that exists

**Cause:** TypeScript using cached/old type definitions

**Fix:**
```bash
# Rebuild the package with types
npm run build -w @restart/shared

# Or restart TypeScript server in IDE
# VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"
```

### 4. Circular Dependencies

**Symptom:** Import returns undefined, or build fails

**Cause:** Package A imports B, B imports A

**Fix:**
- Move shared code to a third package
- Or use dependency injection

```typescript
// Instead of circular import
import { something } from "@restart/other-pkg";

// Pass as parameter
function doThing(something: Something) { ... }
```

---

## Best Practices

### 1. Keep Packages Focused

Each package should have one responsibility:

| Package | Responsibility |
|---------|----------------|
| `shared` | Types and pure utilities |
| `ui` | React components and state |
| `bff` | Server and API |
| `web` | Client entry and bundling |

### 2. Minimize Cross-Dependencies

The dependency graph should be a tree, not a web:

```
Good:                    Bad:
shared                   shared ←──┐
   ↓                        ↓      │
  ui                       ui ─────┤
   ↓                        ↓      │
bff, web                  bff ─────┘
```

### 3. Export Only What's Needed

Don't export internal implementation details:

```typescript
// packages/ui/src/index.ts

// Public API
export { App } from "./App.js";
export { makeStore } from "./store/store.js";

// Don't export internal helpers
// export { internalHelper } from "./internal.js";
```

### 4. Version Consistently

Keep versions in sync across packages. Consider using a tool like [Changesets](https://github.com/changesets/changesets) for version management.

---

## Alternative Approaches

### 1. pnpm Workspaces

pnpm has better performance and stricter dependency isolation:

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
{
  "dependencies": {
    "@restart/shared": "workspace:*"
  }
}
```

**Trade-off:** Faster, stricter, but requires pnpm.

### 2. Nx

Build system with caching and dependency graph:

```bash
npx nx build @restart/bff
# Automatically builds dependencies first
# Caches results
```

**Trade-off:** More features, but more complexity.

### 3. Turborepo

Vercel's monorepo tool with caching:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

**Trade-off:** Great caching, integrates with Vercel.

### 4. Lerna

Traditional monorepo tool (now maintained by Nx):

```json
{
  "packages": ["apps/*", "packages/*"],
  "version": "independent"
}
```

**Trade-off:** Mature ecosystem, but npm workspaces covers most needs now.

---

## Summary

This monorepo setup provides:

1. **Shared code** via local packages (`@restart/shared`, `@restart/ui`)
2. **Single dependency tree** via npm workspaces
3. **Type safety** across packages via TypeScript project references
4. **Consistent tooling** via root-level ESLint/Prettier
5. **Simple development** with watch modes and hot reload

The structure scales well for small-to-medium projects. For larger teams or more packages, consider adding Nx or Turborepo for better caching and task orchestration.
