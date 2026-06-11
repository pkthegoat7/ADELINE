# Web (Next.js) — build do monorepo a partir da raiz:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... -t adelina-web:latest .
# NEXT_PUBLIC_* são embutidas NO BUILD — mudar exige rebuild.
FROM node:22-bookworm-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile --prod=false

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_DEMO_PROPERTY_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_DEMO_PROPERTY_ID=$NEXT_PUBLIC_DEMO_PROPERTY_ID

RUN pnpm --filter @adelina/web build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@adelina/web", "exec", "next", "start", "-p", "3000"]
