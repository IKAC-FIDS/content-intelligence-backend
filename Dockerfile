FROM node:20-bookworm-slim AS builder

WORKDIR /app

ARG NPM_CONFIG_REGISTRY=https://package-mirror.liara.ir/repository/npm/
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}
ENV NPM_CONFIG_REPLACE_REGISTRY_HOST=always

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm config get registry
RUN npm config get replace-registry-host
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build


FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ARG NPM_CONFIG_REGISTRY=https://package-mirror.liara.ir/repository/npm/
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}
ENV NPM_CONFIG_REPLACE_REGISTRY_HOST=always

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tools/rls ./tools/rls
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

CMD ["sh", "-c", "DATABASE_URL=\"$MIGRATION_DATABASE_URL\" npx prisma migrate deploy && node dist/src/main.js"]