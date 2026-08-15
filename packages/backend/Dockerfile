# syntax=docker/dockerfile:1
#
# Build de un solo paquete (@dpages/backend) dentro de un monorepo de npm
# workspaces. Contexto de build: la RAÍZ del repo (hace falta acceso a
# package-lock.json y a packages/shared) —
#   docker build -f packages/backend/Dockerfile .
#
# Node 22 en todas las etapas: misma versión mayor que .nvmrc y CI (fijarla
# igual en los tres lugares evita fallos que sólo aparecen en un entorno).

# ─── deps: instala TODO (dev incluido) para poder compilar más abajo ───────
# Sólo se copian manifiestos (package.json), nunca código fuente, para que
# esta capa quede cacheada mientras no cambien las dependencias. Se incluye
# el package.json (vacío) de packages/frontend únicamente porque
# package-lock.json lo conoce como workspace — así "npm ci" no se queja de
# un workspace ausente. Ni una línea del código de Michel entra acá.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
# --ignore-scripts: en la imagen no hay .git (Husky no aplica) y el build se
# controla explícito en la próxima etapa, no vía "postinstall".
RUN npm ci --ignore-scripts

# ─── build: compila shared y DESPUÉS backend (ADR-010) ─────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN npm run build -w @dpages/shared
RUN npm run build -w @dpages/backend

# ─── prod-deps: sólo dependencias de producción (sin devDependencies) ──────
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
RUN npm ci --omit=dev --ignore-scripts

# ─── runtime: nada de código fuente, nada de devDependencies ───────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

RUN addgroup -S dpages && adduser -S dpages -G dpages

COPY --from=prod-deps --chown=dpages:dpages /app/node_modules ./node_modules

# node_modules/@dpages/shared llegó como symlink de workspace apuntando a
# ./packages/shared, que en esta etapa no existe (ADR-010: se consume
# compilado). Se reemplaza por el paquete real ya compilado.
RUN rm -rf node_modules/@dpages/shared && mkdir -p node_modules/@dpages/shared
COPY --from=build --chown=dpages:dpages /app/packages/shared/dist ./node_modules/@dpages/shared/dist
COPY --from=build --chown=dpages:dpages /app/packages/shared/package.json ./node_modules/@dpages/shared/package.json

COPY --from=build --chown=dpages:dpages /app/packages/backend/dist ./dist
COPY --chown=dpages:dpages packages/backend/package.json ./package.json

# Migraciones (ADR-012): NUNCA se aplican al arrancar el servicio — Cloud Run
# puede levantar varias instancias a la vez y no tiene que haber N procesos
# compitiendo por aplicar el mismo esquema, ni un fallo de migración
# impidiendo que el servicio arranque. Se corren aparte, antes de desplegar
# la revisión nueva (hoy a mano; como Job de Cloud Run cuando se automatice
# el despliegue): `docker run <imagen> node dist/db/migrate.js up`.
COPY --from=build --chown=dpages:dpages /app/packages/backend/migrations ./migrations

USER dpages

EXPOSE 8080

CMD ["node", "dist/index.js"]
