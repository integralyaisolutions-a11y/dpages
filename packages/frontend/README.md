# dPagès — frontend

App de gestión de pedidos de dPagès (Next.js). Panell operatiu para
oficina, obrador, empaquetat i producció — consume la API real del
backend (`packages/backend`), no tiene datos ni autenticación simulados.

Contexto completo del proyecto: [`../../CLAUDE.md`](../../CLAUDE.md) y
[`../../docs/`](../../docs).

## 1. Requisitos previos

- **Node.js 24.x** — el monorepo fija `engines: ">=24 <25"` en el
  `package.json` de la raíz y trae un `.nvmrc` con `24` (si usás `nvm`,
  `nvm use` desde la raíz alcanza). Este paquete (`packages/frontend`) no
  tiene su propio `engines`, hereda el de la raíz.
- **npm** — el monorepo usa npm workspaces (sólo hay `package-lock.json`
  en la raíz; no hay `yarn.lock` ni `pnpm-lock.yaml` propios del proyecto).
  No uses yarn/pnpm para instalar, vas a terminar con un lockfile
  duplicado y quién sabe qué versión resuelta de más.
- **Git**.
- **Docker + Docker Compose** — no hace falta para *este* paquete
  directamente, pero sin el backend (`packages/backend`) corriendo contra
  su Postgres real, la app no pasa de la pantalla de login (ver punto 3 y
  9 más abajo). Ver el arranque del backend en el
  [`README.md` de la raíz](../../README.md).

## 2. Clonado e instalación

Este es un **monorepo** — no existe un repositorio separado sólo para el
frontend. Se clona entero:

```bash
git clone <url-del-repo> dpages
cd dpages
npm install
```

`npm install` desde la **raíz** es obligatorio, no `cd packages/frontend
&& npm install`: este paquete depende de `@dpages/shared` (tipos
compartidos con el backend) como paquete de workspace, y el script
`postinstall` de la raíz ya lo compila solo. Si instalás sólo dentro de
`packages/frontend`, npm no va a poder resolver `@dpages/shared` y vas a
tener errores de tipos raros al levantar el dev server o tipar.

Si editás `packages/shared` en algún momento, no hay recompilación
automática: corré `npm run build:shared` desde la raíz para que el
frontend vea el cambio.

**Si la instalación falla por versión de Node incorrecta**: los errores
típicos son de `engine-strict`/`EBADENGINE` o fallos crípticos compilando
`@dpages/shared`. Confirmá tu versión con `node --version` — tiene que
empezar con `v24`. Con `nvm`: `nvm install 24 && nvm use 24` (leyendo el
`.nvmrc` de la raíz) y volvé a correr `npm install`.

## 3. Variables de entorno

**No existía un `.env.example` en este paquete — lo creé como parte de
esta guía** (`packages/frontend/.env.example`). Copialo a `.env.local`
(Next.js lo carga automático, es la convención estándar, no hay que
tocar ningún script):

```bash
cp .env.example .env.local
```

Las 7 variables que el código realmente lee (confirmado por grep sobre
`src/`, no hay ninguna otra):

| Variable | Para qué sirve | ¿Valor por defecto seguro? |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Host del backend (Fastify) contra el que corren todos los `fetch` (`src/lib/api.ts`) | Sí, en local: `http://localhost:8080` (el puerto por defecto del backend) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Config del proyecto de Firebase, sólo Authentication (`src/lib/firebase.ts`) | No — hace falta el valor real del proyecto |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Ídem | No |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Ídem | No |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Ídem | No |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Ídem | No |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Ídem | No |

**Corrección importante a una idea previa sobre este proyecto**: en algún
momento se documentó (y puede que todavía circule esa idea) que el
frontend corre "desacoplado" con mocks y autenticación simulada. **Ya no
es así** — lo confirmé revisando el código, no lo supongo:

- `src/hooks/useAuth.tsx` llama a Firebase real
  (`signInWithEmailAndPassword`) y después a `GET /jo` contra el backend
  real. No hay ningún camino de login simulado.
- Existe una carpeta `src/mocks/` (`categories.ts`, `catalog.ts`,
  `rates.ts`, `clientTariffs.ts`, `carriers.ts`, `pigYields.ts`) pero
  **ningún archivo del proyecto la importa** — confirmado por grep, es
  código muerto de una etapa anterior. **No existe `src/mocks/users.ts`.**

Esto significa que las variables de Firebase **no tienen un valor
"seguro" inventable** — son las credenciales reales del proyecto de
Firebase que ya usa el equipo. Como son variables `NEXT_PUBLIC_*`
(viajan al navegador por diseño, Next.js las expone igual aunque quisieras
ocultarlas), no son secretas en sentido estricto, pero igual no van
commiteadas con valores reales: pedíselas a un compañero del equipo, o
sacalas de la consola de Firebase (Configuración del proyecto → General →
tus apps → SDK de Firebase) si ya tenés acceso.

## 4. Levantar el proyecto en desarrollo

Desde `packages/frontend` (no desde la raíz — el `npm run dev` de la
**raíz** del monorepo levanta el **backend**, no este paquete):

```bash
cd packages/frontend    # si no estás ya ahí
npm run dev
```

- Abre en **http://localhost:3000**.
- El script `predev` mata cualquier proceso que ya esté escuchando en el
  puerto 3000 antes de arrancar (`kill-port 3000`) — si tenías otra cosa
  corriendo ahí, la va a matar sin avisar.
- Tiempo de arranque, medido en esta máquina, en frío (sin caché de
  `.next`): el servidor queda listo en bien menos de 1 segundo (Next 16
  con Turbopack), y la primera página que abrís (`/login`) compila y
  responde en menos de medio segundo. Cada pantalla nueva compila la
  primera vez que la visitás (comportamiento normal de Turbopack en dev,
  no es que algo esté lento) — las siguientes visitas son instantáneas.

## 5. Credenciales de prueba para login

**No hay usuarios semilla ni autenticación mock en el código actual** —
confirmado arriba (punto 3). No hay ninguna credencial de prueba
hardcodeada en el repo para pegar acá.

Para loguearte de verdad necesitás:

1. Una cuenta real en el proyecto de Firebase (email + contraseña) — no
   hay pantalla de alta/self-signup en este frontend. Alguien con acceso
   de Administrador puede darte de alta desde **Administració
   d'usuaris** (`/users`, requiere el mòdul `usuaris`) — genera un link
   de un solo uso para que vos mismo pongas tu contraseña, no manda el
   email automático, te lo tienen que pasar a mano.
2. El backend corriendo y con esa cuenta ya resuelta en la tabla
   `usuari` — **esto pasa solo**: la primera vez que un uid de Firebase
   válido le pega a `GET /jo`, el backend lo auto-provisiona con el rol
   `General` (ver `resoldre-usuari.ts`) — no hace falta ningún paso
   manual de base de datos aparte del alta en Firebase.

En síntesis: pedile a alguien del equipo que te dé de alta desde
`/users`, o que te pase una cuenta ya creada para desarrollo.

## 6. Estructura del proyecto (resumen orientativo)

```
src/
├─ app/          Rutas (App Router de Next.js) — una carpeta por pantalla
│                 (orders/, catalog/, workshop/, users/, etc.), cada una
│                 con su page.tsx y, si hace falta, sub-componentes propios
│                 (formularios, modales) que sólo usa esa pantalla.
├─ components/
│  ├─ ui/        Componentes de UI genéricos y reutilizables entre
│                 pantallas (Badge, Modal, Pagination, DataCard, etc.)
│  ├─ layout/    Sidebar, AppShell — el armazón visual que envuelve toda
│                 la app
│  └─ auth/      AuthGuard — redirige según sesión/rol antes de
│                 renderizar cualquier pantalla
├─ hooks/        Un hook por recurso del backend (useOrders, useCatalog,
│                 useCategories, etc.) — es la ÚNICA capa que llama a
│                 fetch/la API; ningún componente de página debería
│                 hacer fetch directo
├─ lib/          Cliente HTTP (api.ts), Firebase (firebase.ts), utilidades
│                 de formato (dates.ts, decimals.ts) y reglas de rutas por
│                 rol (roles.ts)
└─ mocks/        Código muerto de una etapa anterior del proyecto — nada
                  lo importa hoy (ver punto 3). No lo uses como referencia
                  de cómo lucen los datos reales, puede estar desalineado.
```

## 7. Scripts disponibles

De `packages/frontend/package.json`:

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Levanta el servidor de desarrollo (`next dev`, Turbopack) en el puerto 3000. Antes mata cualquier proceso ya escuchando ahí (`predev`). |
| `npm run build` | Build de producción (`next build`). |
| `npm run start` | Sirve el build de producción ya generado (`next start`) — corré `build` antes. |
| `npm run lint` | ESLint con la config de este paquete (`eslint-config-next`) — ver la advertencia del punto 9, hoy reporta hallazgos preexistentes. |

## 8. Verificación de que todo funciona

1. Con el backend real corriendo (Postgres + migraciones + `npm run dev`
   del backend, ver `README.md` de la raíz) y `.env.local` completo acá,
   corré `npm run dev` en este paquete.
2. Abrí **http://localhost:3000** — deberías caer automáticamente en
   **`/login`** (un formulario en catalán, email + contraseña; el
   `AuthGuard` redirige ahí a cualquiera sin sesión, incluso si entrás
   por `/`).
3. Iniciá sesión con una cuenta real (ver punto 5).
4. Si el login funciona, deberías terminar en la primera pantalla que tu
   rol tenga permitida (por ejemplo, `/orders` si tenés el mòdul
   `comandes`) — no en una pantalla en blanco ni en un error de red. Si
   ves un listado con datos (o un listado vacío pero sin error), el
   frontend está hablando bien con el backend.
5. Si en cambio el login "funciona" (Firebase acepta el email/contraseña)
   pero termina de nuevo en `/login`, lo más probable es que el backend
   haya rechazado `GET /jo` — revisá que el backend esté corriendo y que
   `NEXT_PUBLIC_API_URL` apunte al puerto correcto.

## 9. Problemas comunes

- **El frontend solo no alcanza para ver nada más allá del login.**
  Sin el backend real corriendo (con su Postgres, migraciones aplicadas,
  y las variables de Firebase del backend configuradas) vas a poder
  abrir `/login`, pero cualquier intento de loguearte o cargar datos va
  a fallar con errores de red. No es un bug de este paquete — es la
  arquitectura real del proyecto, confirmá el arranque del backend en el
  README de la raíz antes de asumir que algo está roto acá.

- **`npm run lint` desde la raíz del monorepo NO lintea este paquete.**
  Encontré esto revisando `eslint.config.js` de la raíz: tiene
  `packages/frontend/**` en sus `ignores` globales, con un comentario
  "Placeholder de Michel: sin código propio todavía" — ya no es cierto,
  pero el ignore sigue ahí. El lint real de este paquete es el de acá
  (`npm run lint` **dentro de `packages/frontend`**, que usa
  `eslint-config-next`, una config distinta a la de la raíz). Corriéndolo
  hoy vas a ver ~41 hallazgos preexistentes (29 errores, 12 warnings),
  casi todos de la regla `react-hooks/set-state-in-effect` (una regla
  nueva, más estricta, sobre el patrón `setIsLoading(true)` dentro de
  `useEffect` que usan casi todos los hooks de datos del proyecto) — no
  son algo que tengas que arreglar para terminar el setup, son deuda
  técnica preexistente que nadie había visto porque el lint de la raíz
  nunca llegó a chequear este código.

- **Tailwind v4 sin `tailwind.config.js`.** Este proyecto usa el modelo
  nuevo de Tailwind v4 (config por CSS, `@theme inline` dentro de
  `src/app/globals.css`, sin archivo `tailwind.config.*`) — si estás
  acostumbrado a Tailwind v3, no busques un archivo de config JS, no
  existe.

- **Next.js 16 es muy reciente.** Hay un archivo
  `AGENTS.md` en este mismo directorio (autogenerado por
  `next dev`, no lo borres a mano) que avisa explícitamente que esta
  versión de Next tiene cambios respecto a lo que la mayoría del
  contenido de referencia/entrenamiento asume — si algo de la API de
  Next no se comporta como esperás, es más probable que sea un cambio
  real de v16 que un bug.
