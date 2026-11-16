# syntax=docker/dockerfile:1
# ════════════════════════════════════════════════════════════════════════
# FinLite KG — образ для собственного сервера (см. deploy/README.md).
# Три стадии: зависимости → сборка → минимальный образ запуска.
# В итоговом образе нет исходников и dev-зависимостей; процесс работает
# от непривилегированного пользователя node (uid 1000).
# ════════════════════════════════════════════════════════════════════════

FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall запускает prisma generate — движок Prisma собирается под этот образ (debian-openssl-3.0.x)
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Вход по учётным записям включается при сборке (переменная попадает в код страниц)
ARG NEXT_PUBLIC_FL_AUTH=on
ENV NEXT_PUBLIC_FL_AUTH=$NEXT_PUBLIC_FL_AUTH FL_STANDALONE=1
RUN npm run build

FROM node:22-bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 \
    TZ=Asia/Bishkek
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Prisma: клиент с движком и консольная утилита для синхронизации схемы при запуске
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node deploy/entrypoint.sh deploy/cron.mjs ./deploy/
RUN chmod +x deploy/entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/app/deploy/entrypoint.sh"]
