# dPagès — sistema de pedidos

Sistema propio de gestión de pedidos de dPagès (producción y distribución de
carne), en reemplazo de las hojas de Excel interconectadas que usan hoy.
WooCommerce es sólo uno de los cuatro canales de entrada (web, correo,
WhatsApp, teléfono) — no es la fuente de verdad del sistema.

Contexto completo del proyecto: [`CLAUDE.md`](./CLAUDE.md) y
[`docs/`](./docs).

## Estructura

Monorepo con npm workspaces:

- `packages/shared` — tipos TypeScript compartidos entre backend y frontend.
- `packages/backend` — API (Fastify), integración de sólo lectura con
  WooCommerce, acceso a datos (PostgreSQL, sin ORM).
- `packages/frontend` — placeholder para la app Next.js (Michel).

## Requisitos

- Node 22 (ver `.nvmrc`)
- Docker + Docker Compose (para PostgreSQL en local)

## Arranque en local

```bash
npm install                # instala todo el workspace, compila @dpages/shared (postinstall) y activa Husky
cp .env.example .env       # completar valores (por defecto ya apunta al Postgres de docker-compose)
docker compose up -d postgres   # levanta PostgreSQL 16 en el puerto 5433 del host
npm run dev                 # backend en modo watch
```

`npm install` ya deja `@dpages/shared` compilado (script `postinstall`) — no
hace falta un paso manual aparte al clonar. Si **editás** `packages/shared`
durante el desarrollo, corré `npm run build:shared` (o `npm run dev -w
@dpages/shared` en otra terminal, en modo watch) para que backend/frontend
vean los cambios: no hay recompilación automática de shared al vuelo.

### Base de datos en local

`docker-compose.yml` levanta dos PostgreSQL 16 independientes:

| Servicio        | Puerto host | Base          | Persistencia                                                                                   |
| --------------- | ----------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `postgres`      | 5433        | `dpages`      | volumen con nombre (sobrevive a `down`)                                                        |
| `postgres-test` | 5434        | `dpages_test` | `tmpfs` — efímera, pensada para que los tests no toquen los datos con los que estás trabajando |

```bash
docker compose up -d              # ambas bases
docker compose up -d postgres     # sólo la de desarrollo
```

## Scripts de la raíz

| Script                            | Qué hace                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `npm run build`                   | Compila `shared` y después `backend`, en ese orden (ver ADR-010)                |
| `npm run dev`                     | Compila `shared` y levanta `backend` en modo watch                              |
| `npm run typecheck`               | Typecheck de todo el monorepo                                                   |
| `npm run test`                    | Compila `shared` y corre los tests de `backend`                                 |
| `npm run lint` / `lint:fix`       | ESLint sobre todo el repo                                                       |
| `npm run format` / `format:check` | Prettier                                                                        |
| `npm run migrate`                 | Corre el runner de migraciones del backend (llega con la capa de base de datos) |

## Documentación

- [`docs/contexto-negocio.md`](./docs/contexto-negocio.md) — negocio,
  canales, equipo, catálogo, plazos, pendientes.
- [`docs/hallazgos-woocommerce.md`](./docs/hallazgos-woocommerce.md) —
  hallazgos verificados de la tienda real.
- [`docs/decisiones-arquitectura.md`](./docs/decisiones-arquitectura.md) —
  ADRs.
- [`docs/contrato-api.md`](./docs/contrato-api.md) — endpoints del backend.
