FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/agent-adapters/package.json packages/agent-adapters/package.json
COPY packages/api-routes/package.json packages/api-routes/package.json
COPY packages/ch-schema/package.json packages/ch-schema/package.json
COPY packages/sql-schema/package.json packages/sql-schema/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN bun install --frozen-lockfile

# Copy source
COPY apps/ apps/
COPY packages/ packages/
COPY turbo.json turbo.json

# Chatwoot config is baked into the frontend at build time via Vite
ARG VITE_CHATWOOT_BASE_URL=""
ARG VITE_CHATWOOT_WEBSITE_TOKEN=""
ARG VITE_CHATWOOT_ENABLED="true"
ARG VITE_POSTHOG_KEY=""
ARG VITE_POSTHOG_HOST="https://us.i.posthog.com"
ARG VITE_POSTHOG_ENABLED="false"

# Build web app and place output where the API serves static files
RUN bun run --cwd apps/web build
RUN cp -r apps/web/dist/ apps/api/public/

EXPOSE 3000
ENV PORT=3000

CMD ["bun", "apps/api/src/index.ts"]
