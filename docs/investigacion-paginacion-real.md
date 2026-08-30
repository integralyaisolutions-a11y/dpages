# Investigación — paginación real (20/página) en los 12 listados

Fecha: 2026-08-30. Sólo investigación — nada de lo listado abajo fue implementado.

## Parte 1 — Inventario de las 12 pantallas

**Hallazgo transversal, antes del detalle**: las 12 pantallas, sin excepción, piden `mida=200` fijo en una sola llamada — ningún hook tiene estado de `pagina`, ni hay botones anterior/siguiente en ningún lado. Es el mismo patrón, copiado y ajustado, en los 12 hooks.

| # | Pantalla | Hook (archivo:línea) | Estado actual |
|---|---|---|---|
| 1 | Categories | `useCategories.ts:21` `MIDA_LLISTAT = 200` | Fijo, sin control |
| 2 | Catàleg | `useCatalog.ts:32` `MIDA_LLISTAT = 200` | Fijo, sin control |
| 3 | Llistat de Tarifes | `useRates.ts:27` `MIDA_LLISTAT = 200` | Fijo, sin control — caso especial (ver abajo) |
| 4 | Tarifes per client | `useClientTariffs.ts:27` `MIDA_LLISTAT = 200` | Fijo, sin control |
| 5 | Comandes | `useOrders.ts:111` `MIDA_LLISTAT = 200` | Fijo, sin control |
| 6 | Rendiments Porcs | `usePigYields.ts:31` `MIDA_LLISTAT = 200` | Fijo, sin control |
| 7 | Panell Oficina | `usePanellOficina.ts:36` `MIDA_LLISTAT = 200` | Fijo, sin control |
| 8 | Panell Obrador | `usePanellObrador.ts` `MIDA_LLISTAT = 200` | Fijo, sin control — caso especial (ver abajo) |
| 9 | Panell Empaquetat | `usePanellEmpaquetat.ts:47` `MIDA_LLISTAT = 200` | Fijo, sin control — caso especial (ver abajo) |
| 10 | Panell Producció | `useProductionPanell.ts:31` `MIDA_LLISTAT = 200` | Fijo, sin control — caso especial (ver abajo) |
| 11 | Usuaris/Rols | `useUsers.ts:31` `MIDA_LLISTAT = 200` | Usuaris pagina; **Rols no** (ver abajo) |
| 12 | Transportistes | `useCarriers.ts` `MIDA_LLISTAT = 200` | Fijo, sin control |

### Shape de paginación del backend — confirmado consistente en 8 endpoints

Todos construidos con las mismas dos funciones compartidas en `comu.ts`: `parsearPaginacio` (parsea `?pagina&mida`, tope `MIDA_PAGINA_MAXIMA = 200`, default `MIDA_PAGINA_DEFECTE = 50`) y `construirPaginacio` (arma la respuesta). Confirmé el shape idéntico `{ pagina, mida, total, totalPagines }` (tipo `Paginacio`, `packages/shared/src/tipos/api.ts:17-22`) en:

- `categories.ts` (vía `construirPaginacio`)
- `transportistes.ts`
- `panells.ts` — los 4 endpoints de panel (`/panells/oficina`, `/panells/obrador`, `/panells/empaquetat`, `/panells/produccio`) usan el mismo shape, aunque cada uno también trae su propio objeto `totals` calculado aparte
- `rendiments-porcs.ts` — con una diferencia de implementación (no de contrato): calcula todas las filas en memoria y hace `dadesCompletes.slice(offset, offset + mida)` en JS en vez de `LIMIT/OFFSET` en SQL; el shape que expone es idéntico, sólo cambia cómo se arma del lado del servidor
- `tarifes.ts` (`/tarifes/matriu`) — **sí pagina y sí devuelve `paginacio`**, pero `useRates.ts` hoy tipa la respuesta como `{ tarifes, dades }` sin declarar el campo `paginacio` que el backend ya manda — es un hueco del lado del frontend, no una inconsistencia del backend
- `usuaris.ts`, `comandes.ts`, `clients.ts` — mismo shape

**Conclusión**: cero variación real de contrato entre endpoints. El backend ya soporta `?pagina=N&mida=20` en los 12 casos sin ningún cambio — esto es 100% trabajo de frontend.

### Excepción real: `GET /rols` no pagina

Confirmado en `useRols.ts` (comentario existente) y en `rols.ts`: la ruta devuelve `{ dades: RolApi[] }`, sin objeto `paginacio`, sin `parsearPaginacio`/`construirPaginacio`. Es la única ruta de las 12 pantallas que no tiene paginación en absoluto del lado del backend — si se pagina "Usuaris/Rols", la pestaña Usuaris se resuelve igual que el resto, pero la pestaña Rols necesita que alguien decida si vale la pena agregarle paginación al backend (hoy son ~7 roles reales, ver `GET /rols` de sesiones anteriores — la lista es corta en la práctica) o dejarla sin paginar a propósito.

## Parte 1 — Casos especiales

### Llistat de Tarifes (rates/page.tsx)

Confirmado en el propio comentario del código (`rates/page.tsx:20-29`, que yo mismo escribí en una tarea anterior): Descripció es la única columna sticky, Categoria/Format/Codi + las columnas de tarifa dinámicas scrollean horizontalmente. Esto es ortogonal al eje de paginación: paginar **filas** (20 productos por página, controles arriba/abajo de la tabla) no toca en nada el scroll **horizontal** de columnas dentro de esas 20 filas — son dos ejes independientes, el fix no debería romper nada del patrón sticky/scroll ya confirmado.

Lo que si es un hallazgo real y no estaba en tu lista: `rates/page.tsx:238-239` tiene un filtro de texto libre client-side (`SearchInput` sobre `descripcio`) que hoy busca sobre los 200 productos ya cargados. Con paginación real de 20, ese buscador **sólo encontraría coincidencias dentro de la página actual** — ver el hallazgo transversal de búsqueda client-side más abajo.

### Panell Obrador / Panell Empaquetat — sort client-side

Confirmado: `workshop/page.tsx` (`sortedData`, ordena por `treballatA !== null`) y `packaging/page.tsx:284-287` (`sortedData`, ordena por `confirmatA !== null`) — ambos hacen `[...data].sort(...)` sobre lo que ya está cargado, pendientes primero. **Pregunta a resolver, no la contesto yo**: con paginación real de 20, ¿"pendientes primero" debe aplicarse:
- (a) sólo dentro de la página actual (una página podría mostrar sólo trabajadas si las pendientes cayeron todas en otra página — probablemente no es lo que se quiere en un panel operativo donde lo urgente es ver qué falta), o
- (b) el backend necesita un parámetro de orden real (`?ordenar=pendents_primer` o similar) que pagine YA ordenado por ese criterio, para que la página 1 muestre siempre las pendientes primero sin importar cuántas haya en total?

Esto no es un detalle menor — para un panel operativo (Obrador/Empaquetat), (a) rompería la utilidad real de la función (ver primero lo urgente), pero (b) requiere tocar el backend, no es sólo frontend. Marcarlo para decidir antes de implementar.

### Panell Producció — `isReady`/`nombrePorcs`

Confirmado en `useProductionPanell.ts:40,44`: no dispara ningún fetch hasta que `nombrePorcs` es un número > 0 (`isReady`). Esto no interactúa mal con paginar — simplemente la paginación tampoco arranca hasta que haya `nombrePorcs`, igual que hoy no arranca el fetch.

Sobre si esta tabla es larga o corta en la práctica: confirmado en `panells.ts` que las filas de este endpoint vienen de un `GROUP BY p.agrupacio_produccio, cat.agrupacio_rendiment` — es decir, cada fila es una **combinación distinta** de estos dos campos, no una fila por línea de pedido. Esto acota estructuralmente el número de filas posibles al número de combinaciones reales del catálogo (hoy con datos de prueba, un puñado; con el catálogo real de ~111 artículos, previsiblemente unas pocas decenas como máximo, no cientos). **Es probable que en la práctica esta pantalla nunca necesite una segunda página** — pero como el backend pagina igual (mismo contrato que el resto), no hay costo en agregarle los controles por consistencia, aunque casi nunca se usen.

### Filtrado de texto libre client-side — hallazgo corregido respecto a tu premisa

Investigué los dos ejemplos que diste (Categories, Client search en Panell Oficina) y **ninguno de los dos es en realidad un filtro de texto libre client-side**:
- **Categories** (`categories/page.tsx`): no tiene ningún `SearchInput` ni `.filter()` — es una lista simple sin buscador. No aplica.
- **Panell Oficina** (`office/page.tsx:99,116,120,132`): el filtro de cliente es un `SelectFilter` (dropdown de clientes exactos) que resuelve a un `clientId` y se manda como parámetro real al backend (`{ clientId }` en `filters`, confirmado en las líneas 128-132) — es servidor-side, no client-side. No aplica tampoco.

Los que **sí** son filtros de texto libre client-side sobre los datos ya cargados (y por lo tanto sí quedarían acotados a la página actual con paginación real) son estos 5, confirmados con grep + lectura de código:

| Pantalla | Archivo:línea | Campo que busca |
|---|---|---|
| Comandes | `orders/page.tsx:132,165-166` | Núm. comanda + Client (2 buscadores) |
| Catàleg | `catalog/page.tsx:94,117` | Descripció |
| Llistat de Tarifes | `rates/page.tsx:238-239,254` | Descripció |
| Tarifes per client | `client-tariffs/page.tsx:56,90` | Codi o nom de client |
| Usuaris | `users/page.tsx:93,135` | Nom o email |

**Hallazgo a decidir, no lo resuelvo yo**: con paginación real de 20, estos 5 buscadores dejarían de buscar en el universo completo y sólo encontrarían coincidencias en la página visible — un comportamiento que probablemente sorprenda al usuario (busca un pedido por número y "no aparece" porque está en la página 3). Antes de implementar hay que decidir, pantalla por pantalla: ¿el backend ya soporta ese filtro como query param real (algunos sí lo hacen para otros campos, ver `producte`/`clientId` en varios paneles) y sólo falta conectarlo, o hay que agregar el filtro al backend?

## Parte 2 — Componente de UI

**No existe ningún componente de paginación** en `components/ui/` — grep de `totalPagines`/patrones de anterior-siguiente en `components/` no da resultados. Existe `DataTable.tsx` (`Table`/`TableRow`/`TableCell`/etc.) pero confirmé que **no lo usa ninguna de las 12 pantallas reales** — construyen su propio `<table>` directamente en cada `page.tsx`. Hay que construir el componente de paginación desde cero.

### Propuesta de diseño (no implementada)

Un componente `Pagination` en `components/ui/Pagination.tsx`, consumiendo directamente el objeto `Paginacio` que ya devuelve el backend (`{ pagina, mida, total, totalPagines }`) — sin reinventar el shape:

```
Props: { paginacio: Paginacio; onPageChange: (pagina: number) => void }
```

- **Desktop/tablet**: fila con `« Anterior` a la izquierda, indicador de texto centrado tipo **"21-40 de 347"** (calculado como `(pagina-1)*mida + 1` a `Math.min(pagina*mida, total)` de `total`), `Siguiente »` a la derecha. Botones deshabilitados en los extremos (`pagina === 1` / `pagina === totalPagines`), mismo estilo `disabled:opacity-60` que ya usan otros botones de la app (`IconButton`, botón "Desar" de los modales).
- **320px (mobile)**: mismo criterio que la auditoría de responsive anterior — a ese ancho no entran los tres elementos en una fila sin apretarse. Propongo apilar: el indicador de texto arriba (centrado, `text-sm text-gray-500`), y debajo una fila de dos botones a ancho completo repartido (`flex gap-2`, cada botón `flex-1`), mismo patrón ya usado en `DataCardActions` para pares de botones en tarjetas mobile.
- Si `totalPagines <= 1`, el componente no debería renderizar nada (ni siquiera deshabilitado) — evita ruido visual en pantallas con pocos registros, coherente con "el fix no debe romper el caso corto" que ya se aplicó en tareas anteriores (grupos de sidebar, Modal.tsx).
- Íconos: `ChevronLeft`/`ChevronRight` de `lucide-react`, ya importados en otros componentes del proyecto (`Sidebar.tsx`), sin agregar ninguna librería nueva.

## Resumen para decidir el plan

1. **Trabajo mecánico, sin decisiones pendientes** (9 de 12 pantallas: Categories, Rendiments Porcs, Transportistes, y las que tienen filtros server-side ya resueltos): agregar estado de `pagina`, pasar `mida=20`, conectar el componente `Pagination` nuevo. Backend no requiere cambios.
2. **Decisión de negocio antes de implementar** (Obrador/Empaquetat): ¿ordenar "pendientes primero" sólo en la página actual, o pedirle a Gerardo un parámetro de orden real en el backend?
3. **Decisión de producto antes de implementar** (5 buscadores client-side: Comandes, Catàleg, Llistat de Tarifes, Tarifes per client, Usuaris): ¿mover cada buscador a un filtro server-side real, o aceptar que busque sólo en la página actual?
4. **Sin decisión pendiente, sólo un ajuste menor de backend a evaluar** (Rols): agregarle paginación al backend o dejarlo sin paginar (lista corta en la práctica).
5. **Probablemente no haga falta paginar en la práctica** (Panell Producció) — agregar los controles igual por consistencia, bajo costo.
