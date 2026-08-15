# @dpages/frontend

Placeholder. Todavía no hay scaffold de Next.js — lo arma Michel.

## Cómo consumir `@dpages/shared`

Se decidió (ADR-010, ver `docs/decisiones-arquitectura.md`) que
`@dpages/shared` se consume como paquete **compilado**, no como código
fuente vía paths de TypeScript. Next.js lo resuelve sin configuración
adicional, siempre que esté compilado:

```bash
npm install   # desde la raíz del monorepo — ya compila @dpages/shared solo (script "postinstall")
```

El `dist/` de `shared` no está commiteado, así que si lo ves desactualizado
(por ejemplo, Gerardo editó un tipo y no volvió a compilar) corré
`npm run build:shared` desde la raíz.

## Pendiente de definir con el cliente (no bloquea empezar el frontend)

- Si el sistema es bilingüe catalán/castellano o sólo catalán.
- Campos de agrupación del catálogo para las pantallas.

Ver `docs/contexto-negocio.md` para el resto de las decisiones abiertas y
`docs/contrato-api.md` para los endpoints del backend a medida que existen.
