FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4300 MAQAM_DB=/data/maqam.db
COPY --from=build /app /app
VOLUME /data
EXPOSE 4300
CMD ["node", "server/src/index.js"]
