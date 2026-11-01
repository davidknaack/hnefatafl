FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS web-build
COPY tsconfig*.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY shared ./shared
ENV VITE_RELAY_URL=/relay
RUN npm run build

FROM dependencies AS relay-build
COPY tsconfig*.json ./
COPY server ./server
COPY shared ./shared
RUN npm run build:server

FROM node:24-bookworm-slim AS relay
WORKDIR /app
ENV NODE_ENV=production RELAY_HOST=0.0.0.0 RELAY_PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=relay-build --chown=node:node /app/dist-server ./dist-server
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/health').then(async r => { if (!r.ok || (await r.json()).status !== 'ok') process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist-server/server/main.js"]

FROM nginx:1.28-alpine AS web
ENV SERVICE_NAME_RELAY=relay NGINX_ENVSUBST_FILTER=SERVICE_NAME_RELAY
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
