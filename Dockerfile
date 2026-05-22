# syntax=docker/dockerfile:1.7

FROM node:22-bookworm AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable \
  && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages packages
RUN pnpm --filter @pic/backend prisma:generate
RUN pnpm build
RUN mkdir -p packages/backend/public && cp -r packages/frontend/dist/. packages/backend/public/

FROM base AS runtime
ENV NODE_ENV="production"
ENV PORT="3000"
ENV FILES_DIR="/data/files"
ENV FRONTEND_DIST_DIR="packages/backend/public"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/backend/dist packages/backend/dist
COPY --from=builder /app/packages/backend/prisma packages/backend/prisma
COPY --from=builder /app/packages/backend/public packages/backend/public
COPY docker/entrypoint.sh docker/entrypoint.sh
RUN pnpm --filter @pic/backend prisma:generate \
  && chmod +x docker/entrypoint.sh
EXPOSE 3000
VOLUME ["/data/files"]
ENTRYPOINT ["docker/entrypoint.sh"]
