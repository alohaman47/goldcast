# GoldCast — Railway / any-Docker deploy (static SPA)
# Stage 1: build the Vite app
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: serve dist/ with SPA fallback (serve -s)
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14 --no-audit --no-fund
COPY --from=build /app/dist ./dist
ENV PORT=3000
EXPOSE 3000
# serve -s = single-page-app fallback to index.html (required: BrowserRouter)
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
