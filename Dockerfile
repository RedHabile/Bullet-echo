# ── THE HOLLOW · image de production (serveur Node persistant) ──────────────
# Le mode multijoueur garde les sessions en mémoire : déployez cette image
# sur un hôte à processus unique et persistant (Railway, Render, Fly, VPS…).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Valeur factice : les routes API sont dynamiques, la base n'est pas requise au build.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/drizzle.config.json ./drizzle.config.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src/db ./src/db
EXPOSE 3000
CMD ["npm", "run", "start"]
