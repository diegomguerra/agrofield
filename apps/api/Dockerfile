FROM node:20-alpine AS base
WORKDIR /app

# Instala dependências
FROM base AS deps
COPY apps/api/package.json ./
RUN npm install --production=false

# Build TypeScript
FROM deps AS build
COPY apps/api/ ./
RUN npm run build

# Imagem final enxuta
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY apps/api/package.json ./

EXPOSE 3001

CMD ["node", "dist/server.js"]
