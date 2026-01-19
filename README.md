# Restart

A full-stack React application demonstrating production-ready frontend architecture patterns.

## Features

- **Server-Side Rendering (SSR)** - Fast initial page loads with pre-rendered HTML
- **Client-Side Hydration** - Interactive React after SSR
- **Monorepo Architecture** - Shared code between server and client
- **RTK Query** - Data fetching with built-in caching
- **Service Workers** - Offline support via Workbox
- **TypeScript** - Strict type safety throughout

## Quick Start

```bash
# Install dependencies
npm install

# Development (CSR mode on port 8080)
npm run dev

# Production build + start (SSR mode on port 3000)
npm run build && npm start
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both BFF and web dev servers |
| `npm run dev:web` | Start webpack-dev-server only (port 8080) |
| `npm run dev:bff` | Start BFF server only (port 3000) |
| `npm run build` | Build all packages in dependency order |
| `npm start` | Start production BFF server |
| `npm run lint` | Run ESLint across all workspaces |
| `npm run format` | Run Prettier across all workspaces |

## Project Structure

```
restart/
├── apps/
│   ├── bff/                 # Backend-for-Frontend (Express)
│   │   ├── src/
│   │   │   ├── http/        # Routes and middleware
│   │   │   └── server/      # SSR, caching, bootstrap
│   │   └── static/          # Built client assets (generated)
│   │
│   └── web/                 # Frontend entry point
│       ├── src/
│       │   ├── main.tsx     # Client entry
│       │   └── service-worker.ts
│       ├── public/          # Static files (404.html, etc.)
│       └── webpack.config.cjs
│
├── packages/
│   ├── shared/              # Types and utilities (isomorphic)
│   └── ui/                  # React components, pages, Redux store
│
└── docs/                    # Architecture documentation
```

## Development vs Production

| Aspect | Development (port 8080) | Production (port 3000) |
|--------|------------------------|------------------------|
| Rendering | Client-Side (CSR) | Server-Side (SSR) |
| Data Loading | RTK Query fetches on mount | Pre-populated from server |
| Hot Reload | Yes | No |
| Service Worker | Disabled | Enabled |
| CSS | Injected via JS | Extracted to file |

## Architecture

```
Browser                          BFF Server
┌─────────────────────┐         ┌─────────────────────┐
│  React App          │         │  Express            │
│  ├─ React Router    │  HTTP   │  ├─ Static files    │
│  ├─ Redux Store     │ ◄─────► │  ├─ API routes      │
│  └─ RTK Query       │         │  └─ SSR handler     │
└─────────────────────┘         └─────────────────────┘
                                          │
                                          ▼
                                ┌─────────────────────┐
                                │  External APIs      │
                                └─────────────────────┘
```

## Build Order

Packages must build in dependency order:

```bash
@restart/shared  →  @restart/ui  →  @restart/web  →  @restart/bff
```

The `npm run build` script handles this automatically.

## Documentation

Detailed architecture docs are in the [`docs/`](./docs/README.md) folder:

- [Monorepo Setup](./docs/10-monorepo-setup.md) - Workspace configuration
- [Build Process](./docs/01-build-process.md) - Webpack and TypeScript compilation
- [SSR & Hydration](./docs/07-ssr-hydration.md) - Server rendering architecture
- [State Management](./docs/05-state-management.md) - Redux Toolkit patterns
- [Data Fetching](./docs/06-data-fetching.md) - RTK Query setup
- [Service Workers](./docs/13-service-workers.md) - Workbox caching strategies
- [Dev vs Prod](./docs/14-dev-vs-prod.md) - Environment differences

## Docker

```bash
# Development with hot reload
docker-compose up

# Production build
docker build -t restart .
docker run -p 3000:3000 restart
```
