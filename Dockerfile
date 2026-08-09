# GoldCast — Railway / any-Docker deploy (static SPA + tiny AI proxy API)
# Stage 1: build the Vite app
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: production runtime — node server/index.js
# (serves dist/ with SPA fallback + POST /api/professor → Kimi proxy)
FROM node:20-alpine
WORKDIR /app
# install production deps only (express) for a small runtime image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY server ./server
ENV PORT=3000
EXPOSE 3000
# node server = static dist/ with SPA fallback (same behavior as serve -s dist)
#               + /api/professor AI proxy (needs MOONSHOT_API_KEY at runtime)
CMD ["node", "server/index.js"]
