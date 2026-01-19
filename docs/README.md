# Frontend Systems Design Documentation

Welcome! This documentation explains the architectural patterns in this codebase. It's written for developers who want to understand not just *what* exists, but *why* it's built this way and *how* it all fits together.

## What Is This Project?

This is a **full-stack React application** demonstrating production-ready patterns:

- **Server-Side Rendering (SSR)** for fast initial page loads
- **Client-Side Hydration** for interactive React after SSR
- **Monorepo Architecture** for shared code between server and client
- **Type Safety** with strict TypeScript throughout
- **Modern Tooling** with Webpack, ESLint, and Docker
- **Service Workers** for offline support and caching (Workbox)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    React App                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ React Router│  │ Redux Store │  │   RTK Query     │  │    │
│  │  │  (routing)  │  │   (state)   │  │ (data fetching) │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ HTTP requests to /api/*           │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BFF SERVER (Express)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Request Handler                      │    │
│  │  ┌───────────┐  ┌───────────┐  ┌─────────────────────┐  │    │
│  │  │  Static   │  │    API    │  │    SSR Handler      │  │    │
│  │  │  Files    │  │  Routes   │  │ (React + Bootstrap) │  │    │
│  │  └───────────┘  └───────────┘  └─────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ External API calls                │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   External APIs     │
                    │ (jsonplaceholder)   │
                    └─────────────────────┘
```

## Documentation Index

### Core Concepts

| Document | Description |
|----------|-------------|
| [01 - Build Process](./01-build-process.md) | Webpack configuration, asset compilation, and build pipeline |
| [02 - TypeScript Setup](./02-typescript-setup.md) | Strict mode, path aliases, and type organization |
| [03 - Linting Setup](./03-linting-setup.md) | ESLint and Prettier configuration |

### Frontend Architecture

| Document | Description |
|----------|-------------|
| [04 - Client Routing](./04-client-routing.md) | React Router setup and navigation patterns |
| [05 - State Management](./05-state-management.md) | Redux Toolkit store and slices |
| [06 - Data Fetching](./06-data-fetching.md) | RTK Query and HTTP client patterns |

### Server-Side Rendering

| Document | Description |
|----------|-------------|
| [07 - SSR & Hydration](./07-ssr-hydration.md) | How server rendering and client hydration work |
| [08 - Isomorphic State](./08-isomorphic-state.md) | Transferring state from server to client |

### Infrastructure

| Document | Description |
|----------|-------------|
| [09 - Docker](./09-docker.md) | Container setup for development and production |
| [10 - Monorepo Setup](./10-monorepo-setup.md) | Workspace configuration and shared packages |
| [11 - Hot Module Replacement](./11-hmr.md) | Development experience with hot reload |
| [12 - Code Splitting](./12-code-splitting.md) | Bundle optimization strategies |
| [13 - Service Workers](./13-service-workers.md) | Workbox, caching strategies, offline support |
| [14 - Dev vs Prod](./14-dev-vs-prod.md) | Differences between development and production modes |

## Quick Start

```bash
# Install dependencies
npm install

# Development (runs both server and client)
npm run dev

# Or run separately:
npm run dev:bff   # Server on http://localhost:3000
npm run dev:web   # Client dev server on http://localhost:8080

# Production build
npm run build

# Start production server
npm start
```

## Project Structure

```
restart/
├── apps/
│   ├── bff/                 # Backend-for-Frontend (Express server)
│   │   ├── src/
│   │   │   ├── http/        # Route handlers and middleware
│   │   │   └── server/      # SSR, caching, external APIs
│   │   └── static/          # Built client assets
│   │
│   └── web/                 # Frontend entry point
│       ├── src/
│       │   ├── main.tsx         # Client entry point
│       │   ├── bootstrap.ts     # State reading from window
│       │   ├── service-worker.ts # Service worker (Workbox)
│       │   └── sw-register.ts   # SW registration logic
│       └── webpack.config.cjs
│
├── packages/
│   ├── shared/              # Types and utilities (isomorphic)
│   │   └── src/
│   │       ├── types/       # TypeScript type definitions
│   │       └── utils/       # Shared helper functions
│   │
│   └── ui/                  # React components and state
│       └── src/
│           ├── pages/       # Page components
│           ├── store/       # Redux store and slices
│           └── bootstrap/   # Bootstrap application logic
│
├── docs/                    # You are here!
├── Dockerfile               # Production container
└── docker-compose.yml       # Development containers
```

## Key Terminology

| Term | Definition |
|------|------------|
| **BFF** | Backend-for-Frontend. A server that sits between the frontend and external APIs, handling SSR and data aggregation. |
| **SSR** | Server-Side Rendering. Generating HTML on the server instead of in the browser. |
| **Hydration** | The process of React "taking over" server-rendered HTML and making it interactive. |
| **Bootstrap** | Initial data needed to render a page. Generated on server, passed to client. |
| **Isomorphic** | Code that runs identically on both server and client. |
| **RTK Query** | Redux Toolkit's data fetching library with built-in caching. |
| **Monorepo** | A single repository containing multiple packages/apps. |
| **Service Worker** | A script that runs in the background, enabling offline support and caching. |
| **Workbox** | Google's library for building service workers with pre-built caching strategies. |

## Learning Path

If you're new to this codebase, we recommend reading in this order:

1. **[Monorepo Setup](./10-monorepo-setup.md)** - Understand the project structure first
2. **[Build Process](./01-build-process.md)** - How code gets compiled and bundled
3. **[State Management](./05-state-management.md)** - How data flows in the app
4. **[SSR & Hydration](./07-ssr-hydration.md)** - The core architectural pattern
5. **[Isomorphic State](./08-isomorphic-state.md)** - How server and client share data

Then explore the remaining docs based on what you're working on.
