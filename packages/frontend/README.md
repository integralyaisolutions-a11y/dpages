# @dpages/frontend

Placeholder. Todavía no hay scaffold de Next.js — lo arma Michel.

## Cómo consumir `@dpages/shared`

Se decidió (ADR-010, ver `docs/decisiones-arquitectura.md`) que
`@dpages/shared` se consume como paquete **compilado**, no como código
fuente vía paths de TypeScript. Next.js lo resuelve sin configuración
adicional, siempre que esté compilado:

```bash
npm install
npm run build:shared   # desde la raíz del monorepo, antes de levantar el dev server
```

Si el editor no encuentra los tipos de `@dpages/shared`, corré
`npm run build:shared` desde la raíz — el `dist/` no está commiteado.

## Pendiente de definir con el cliente (no bloquea empezar el frontend)

- Si el sistema es bilingüe catalán/castellano o sólo catalán.
- Campos de agrupación del catálogo para las pantallas.

Ver `docs/contexto-negocio.md` para el resto de las decisiones abiertas y
`docs/contrato-api.md` para los endpoints del backend a medida que existen.
