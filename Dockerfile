# syntax=docker/dockerfile:1

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Web app as a standalone server, plus the scraper/backup CLIs bundled to
# single files so the runtime image needs no dev dependencies.
RUN pnpm build && pnpm build:scripts

# ---- runtime -------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/family.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

# App files stay root-owned, so the unprivileged runtime user cannot modify
# them; /data is the only place it can write.
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public
COPY --from=build /src/dist ./dist
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
