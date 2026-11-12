FROM node:24.22.1-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY docker/entrypoint.js docker/entrypoint.js
RUN pnpm --filter @tumi/contracts build \
  && pnpm --filter @tumi/database build \
  && pnpm --filter @tumi/api build \
  && pnpm --filter @tumi/worker build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
ENTRYPOINT ["node", "docker/entrypoint.js"]

FROM runtime AS api
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM runtime AS worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ffmpeg curl \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+x /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*
CMD ["node", "apps/worker/dist/main.js"]
