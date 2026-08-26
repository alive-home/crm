# Build the static client and a runtime image that serves it alongside the Hono API.
# Bun is both the bundler host and the production runtime, so one toolchain covers both stages.
FROM oven/bun:1.2.12 AS build
WORKDIR /app

# Dependencies first: this layer only busts when the manifest or lockfile changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.2.12-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production deps only — vite, biome and the tagger are build-time concerns.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# server/ holds the CRM routes and the Turso client and is imported at startup. `src` is not copied:
# the runtime no longer reads anything out of it, the client is already built into dist.
COPY --from=build /app/dist ./dist
COPY server.ts ./
COPY server ./server

# Neither half of the CRM connection is baked in. TURSO_API_KEY_CRM is a secret and
# TURSO_DATABASE_URL_CRM has no default in code, so both are set on the platform
# (`fly secrets set ...`). Without them the CRM routes fail loudly rather than serving an empty
# database, or a different one.
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "server.ts"]
