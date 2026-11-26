FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json frontend/
RUN npm ci --include=dev && npm ci --prefix frontend
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production BIND_HOST=0.0.0.0
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist dist
COPY --from=build /app/frontend/dist frontend/dist
COPY db db
USER node
EXPOSE 8080
CMD ["node","dist/main.js"]
