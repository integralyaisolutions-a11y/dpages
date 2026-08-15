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

**Antes de correr nada** (`npm run dev`, `migrate`, lo que sea): copiá
`.env.example` a `.env` **en la raíz del monorepo** y completá los
valores reales (credenciales de WooCommerce, etc.). Sin este paso, `dev` y
`migrate` fallan al arrancar con un mensaje de `env.ts` diciendo qué
variable falta — es el primer tropiezo esperable al clonar el repo.

```bash
npm install                     # instala todo el workspace, compila @dpages/shared (postinstall) y activa Husky
cp .env.example .env            # EN LA RAÍZ — completar valores reales antes de seguir
docker compose up -d postgres   # levanta PostgreSQL 16 en el puerto 5433 del host
npm run migrate                 # aplica el esquema (ver docs/decisiones-arquitectura.md, ADR-011)
npm run dev                     # backend en modo watch
```

`npm install` ya deja `@dpages/shared` compilado (script `postinstall`) — no
hace falta un paso manual aparte al clonar. Si **editás** `packages/shared`
durante el desarrollo, corré `npm run build:shared` (o `npm run dev -w
@dpages/shared` en otra terminal, en modo watch) para que backend/frontend
vean los cambios: no hay recompilación automática de shared al vuelo.

`.env` vive en la raíz, pero los scripts de `@dpages/backend` corren con
cwd en `packages/backend` — `dev`, `start`, `migrate` y `migrate:status` lo
cargan explícitamente desde ahí (`--env-file-if-exists=../../.env`, ver
ADR-013). `npm run test`/`build`/`typecheck` **no** lo tocan: los tests
usan sus propias variables (`vitest.config.ts`), no las de tu `.env`, para
que tu máquina y CI se comporten igual. En producción (Cloud Run) tampoco
se carga ningún `.env` — las variables las inyecta la plataforma.

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

| Script                            | Qué hace                                                               |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run build`                   | Compila `shared` y después `backend`, en ese orden (ver ADR-010)       |
| `npm run dev`                     | Compila `shared` y levanta `backend` en modo watch                     |
| `npm run typecheck`               | Typecheck de todo el monorepo                                          |
| `npm run test`                    | Compila `shared` y corre los tests de `backend`                        |
| `npm run lint` / `lint:fix`       | ESLint sobre todo el repo                                              |
| `npm run format` / `format:check` | Prettier                                                               |
| `npm run migrate`                 | Aplica las migraciones pendientes contra `DATABASE_URL` (carga `.env`) |
| `npm run migrate:status`          | Muestra qué migraciones están aplicadas y cuáles faltan (carga `.env`) |

## Documentación

- [`docs/contexto-negocio.md`](./docs/contexto-negocio.md) — negocio,
  canales, equipo, catálogo, plazos, pendientes.
- [`docs/hallazgos-woocommerce.md`](./docs/hallazgos-woocommerce.md) —
  hallazgos verificados de la tienda real.
- [`docs/decisiones-arquitectura.md`](./docs/decisiones-arquitectura.md) —
  ADRs.
- [`docs/contrato-api.md`](./docs/contrato-api.md) — endpoints del backend.
