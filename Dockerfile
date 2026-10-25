# syntax=docker/dockerfile:1
# Production image for the web-nas app (Next.js). Caddy publishes it; the
# container itself only listens on 3000 inside the compose network.

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS build
# bcrypt and sharp ship prebuilt musl binaries for x64 and arm64, so no C toolchain.
# Only the schema is copied before installing: postinstall runs prisma generate,
# and source or migration changes must not invalidate the install layer.
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
# Prisma CLI (dev dependency) is kept: the schema is synced on every start
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
# db push refuses changes that would lose data, so a bad schema stops the
# container instead of silently dropping columns
CMD ["sh", "-c", "npx prisma db push --skip-generate && exec npx next start -p \"$PORT\""]
