# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:25-alpine AS build
WORKDIR /app

# Install deps first for caching
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .

RUN npm run build

# ---------- Runtime stage ----------
FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build outputs
COPY --from=build /app/dist ./dist
COPY --from=build /app/static ./static

EXPOSE 3000

CMD ["node", "dist/index.js"]