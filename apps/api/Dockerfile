# API (NestJS) — build do monorepo a partir da raiz:
#   docker build -f apps/api/Dockerfile -t adelina-api:latest .
FROM node:22-bookworm-slim

# openssl: exigido pelos engines do Prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @adelina/db generate && pnpm --filter @adelina/api build

ENV NODE_ENV=production
EXPOSE 3333
CMD ["node", "apps/api/dist/main.js"]
