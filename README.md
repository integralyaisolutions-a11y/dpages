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
- Docker (para PostgreSQL en local — se agrega en la próxima capa)

## Arranque en local

```bash
npm install                # instala todo el workspace y activa Husky (script "prepare")
npm run build:shared       # compila @dpages/shared — hace falta antes de tocar backend/frontend
cp .env.example .env       # completar valores
npm run dev                # backend en modo watch
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
