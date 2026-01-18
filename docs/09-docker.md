# Docker Setup

This document explains the Docker configuration for development and production.

## Overview

Docker provides consistent environments across machines. This project has two Docker configurations:

| File | Purpose |
|------|---------|
| `Dockerfile` | Production build (optimized, minimal) |
| `docker-compose.yml` | Development environment (hot reload, debugging) |

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEVELOPMENT                               │
│                     (docker-compose.yml)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Docker Compose                            │  │
│  │  ┌─────────────────┐      ┌─────────────────┐             │  │
│  │  │   bff service   │◄────►│   web service   │             │  │
│  │  │   (Express)     │      │   (Webpack)     │             │  │
│  │  │   Port 3000     │      │   Port 8080     │             │  │
│  │  └────────┬────────┘      └────────┬────────┘             │  │
│  │           │                        │                       │  │
│  │           └────────────────────────┘                       │  │
│  │                        │                                   │  │
│  │              Shared node_modules volume                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        PRODUCTION                                │
│                         (Dockerfile)                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 Single Container                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              BFF Server (Express)                    │  │  │
│  │  │  • Serves SSR pages                                  │  │  │
│  │  │  • Serves static assets (built client)               │  │  │
│  │  │  • Handles API routes                                │  │  │
│  │  │  Port 3000                                           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Production Dockerfile

**File:** `Dockerfile`

```dockerfile
# --- Build Stage ---
FROM node:25-alpine AS build
WORKDIR /app

# Copy package files first (better caching)
COPY package.json package-lock.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

# Install dependencies
RUN npm ci --workspaces

# Copy source code
COPY . .

# Build all packages
RUN npm run build

# --- Runtime Stage ---
FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=build /app/apps/bff/dist ./apps/bff/dist
COPY --from=build /app/apps/bff/static ./apps/bff/static
COPY --from=build /app/packages/ui/dist ./packages/ui/dist
COPY --from=build /app/packages/ui/package.json ./packages/ui/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "apps/bff/dist/index.js"]
```

### Understanding Multi-Stage Builds

Docker multi-stage builds use multiple `FROM` statements. Each creates a "stage":

```dockerfile
FROM node:25-alpine AS build   # Stage 1: "build"
# ... build stuff

FROM node:25-alpine AS runtime # Stage 2: "runtime"
# ... only runtime stuff
```

**Why multi-stage?**

| Single Stage | Multi-Stage |
|--------------|-------------|
| Final image has source code | Final image has only compiled code |
| Final image has dev dependencies | Final image has no dev dependencies |
| Larger image (~1GB+) | Smaller image (~200MB) |

### Layer Caching

Docker caches each instruction. If a layer hasn't changed, it's reused:

```dockerfile
# These layers are cached if package files haven't changed
COPY package.json package-lock.json ./
COPY apps/bff/package.json apps/bff/package.json
# ...
RUN npm ci --workspaces  # Only re-runs if package files changed

# This layer re-runs when any source file changes
COPY . .
RUN npm run build
```

**Best practice:** Copy files that change less frequently first.

### Why `npm ci` Instead of `npm install`?

| `npm install` | `npm ci` |
|---------------|----------|
| Updates package-lock.json | Requires exact package-lock.json |
| Might install different versions | Always installs exact versions |
| Good for development | Good for CI/production |

### What Gets Copied to Runtime

```dockerfile
# Server code (compiled)
COPY --from=build /app/apps/bff/dist ./apps/bff/dist

# Client assets (bundled)
COPY --from=build /app/apps/bff/static ./apps/bff/static

# Shared packages (for SSR imports)
COPY --from=build /app/packages/ui/dist ./packages/ui/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
```

**Not copied:**
- Source code (`src/`)
- Development dependencies
- Build tools (webpack, TypeScript, etc.)
- Test files

---

## Development Docker Compose

**File:** `docker-compose.yml`

```yaml
services:
  bff:
    image: node:25-alpine
    working_dir: /app
    volumes:
      - ./:/app                          # Mount source code
      - node_modules:/app/node_modules   # Named volume for deps
    command: sh -lc "npm install --workspaces && npm run dev:bff"
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development

  web:
    image: node:25-alpine
    working_dir: /app
    volumes:
      - ./:/app
      - node_modules:/app/node_modules
    command: sh -lc "npm install --workspaces && npm run dev:web"
    ports:
      - "8080:8080"
    environment:
      DOCKER: "true"              # Tells webpack to proxy to bff:3000
      NODE_ENV: development
    depends_on:
      - bff

volumes:
  node_modules:                   # Shared volume for node_modules
```

### Volume Mounts

```yaml
volumes:
  - ./:/app                        # Bind mount: host → container
  - node_modules:/app/node_modules # Named volume
```

**Bind mount (`./:/app`):**
- Maps host directory to container
- Changes on host appear in container immediately
- Enables hot reload

**Named volume (`node_modules`):**
- Docker-managed storage
- Persists across container restarts
- Faster than bind mounts on Mac/Windows
- Prevents host `node_modules` from conflicting

### Why Two Services?

| bff service | web service |
|-------------|-------------|
| Express server | Webpack dev server |
| SSR, API routes | Hot module replacement |
| Port 3000 | Port 8080 |

In development, you typically access `http://localhost:8080` (webpack). The webpack dev server proxies API requests to the BFF.

### The DOCKER Environment Variable

```yaml
environment:
  DOCKER: "true"
```

In `webpack.config.cjs`:

```javascript
proxy: [
  {
    context: ["/api"],
    target: process.env.DOCKER === "true"
      ? "http://bff:3000"    // Inside Docker network
      : "http://localhost:3000",  // On host machine
  },
],
```

Docker containers communicate via service names (`bff`), not `localhost`.

### depends_on

```yaml
web:
  depends_on:
    - bff
```

Ensures `bff` starts before `web`. Note: This only waits for the container to start, not for the app to be ready.

For true readiness checking:

```yaml
web:
  depends_on:
    bff:
      condition: service_healthy

bff:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    interval: 5s
    timeout: 3s
    retries: 3
```

---

## Running Docker

### Development

```bash
# Start all services
docker compose up

# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild after package.json changes
docker compose down
docker compose up --build
```

### Production

```bash
# Build image
docker build -t my-app .

# Run container
docker run -p 3000:3000 my-app

# With environment variables
docker run -p 3000:3000 -e API_URL=https://api.example.com my-app
```

---

## Common Docker Commands

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View container logs
docker logs <container-id>

# Execute command in running container
docker exec -it <container-id> sh

# Remove all stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove everything unused
docker system prune
```

---

## Debugging in Docker

### Access Container Shell

```bash
docker compose exec bff sh
# Now you're inside the container

# Check files
ls -la /app

# Check environment
env

# Test network
ping web  # Can reach other services by name
```

### View Real-Time Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f bff
```

### Check Resource Usage

```bash
docker stats
```

---

## Common Issues

### 1. "npm install" Fails

**Symptom:** Container fails to start with npm errors

**Causes:**
- Corrupted `node_modules` volume
- Package-lock.json mismatch

**Fix:**
```bash
# Remove the volume and rebuild
docker compose down -v  # -v removes volumes
docker compose up --build
```

### 2. Changes Not Appearing

**Symptom:** Code changes don't show up in container

**Causes:**
- Volume not mounted correctly
- File watching not working

**Fix:**
```bash
# Check mounts
docker compose exec bff ls -la /app/apps/bff/src

# Force rebuild
docker compose up --build --force-recreate
```

### 3. "Cannot connect to bff"

**Symptom:** Web service can't reach BFF

**Cause:** Using `localhost` instead of service name

**Fix:** Use Docker service names:
```javascript
// Inside Docker
const apiUrl = "http://bff:3000";

// Outside Docker
const apiUrl = "http://localhost:3000";
```

### 4. Port Already in Use

**Symptom:** "port is already allocated"

**Cause:** Another process using port 3000 or 8080

**Fix:**
```bash
# Find what's using the port
lsof -i :3000

# Or change the port in docker-compose.yml
ports:
  - "3001:3000"  # Map container 3000 to host 3001
```

### 5. Slow on Mac/Windows

**Symptom:** File operations are slow

**Cause:** Bind mounts are slow on non-Linux

**Fix:** Use named volumes for `node_modules` (already done in this project). For more speed, consider:
- Docker Desktop's "VirtioFS" file sharing
- Mutagen for syncing
- Running Linux or WSL2

---

## Production Considerations

### Environment Variables

Don't hardcode secrets. Use environment variables:

```dockerfile
# In Dockerfile
ENV API_KEY=""  # Default empty

# When running
docker run -e API_KEY=secret123 my-app
```

Or use Docker secrets/config management.

### Health Checks

Add health checks for orchestrators:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

### Non-Root User

Don't run as root in production:

```dockerfile
# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Switch to non-root user
USER appuser
```

### Read-Only Filesystem

For security, make the filesystem read-only:

```bash
docker run --read-only -v /tmp:/tmp my-app
```

---

## Alternative Approaches

### 1. Docker Buildx (Multi-Platform)

Build for multiple architectures:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t my-app .
```

### 2. Distroless Images

Even smaller images without shell:

```dockerfile
FROM gcr.io/distroless/nodejs:18
COPY --from=build /app/dist /app
CMD ["app/index.js"]
```

**Trade-off:** Smaller and more secure, but can't `exec` into container.

### 3. Podman

Docker alternative that doesn't require a daemon:

```bash
podman build -t my-app .
podman run -p 3000:3000 my-app
```

Compatible with Dockerfiles and docker-compose (via podman-compose).
