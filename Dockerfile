# --- build stage ---
FROM node:25-alpine AS build
WORKDIR /app

# Copy only manifests first for better caching
COPY package.json package-lock.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

# Install all workspaces
RUN npm ci --workspaces

# Now copy the rest of the source
COPY . .

# Build everything (shared -> ui -> web -> bff)
RUN npm run build

# --- runtime stage ---
FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy the built server + static assets + necessary workspace package outputs
COPY --from=build /app/apps/bff/dist ./apps/bff/dist
COPY --from=build /app/apps/bff/static ./apps/bff/static

# If bff runtime imports @restart/ui, we must include its dist too
COPY --from=build /app/packages/ui/dist ./packages/ui/dist
COPY --from=build /app/packages/ui/package.json ./packages/ui/package.json

# If bff runtime imports @restart/shared, include its dist too
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json

# Also copy root package.json so Node ESM resolution has package metadata if needed
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# Run the compiled BFF
CMD ["node", "apps/bff/dist/index.js"]