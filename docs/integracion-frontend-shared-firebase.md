# Integración del frontend con `@dpages/shared` y Firebase Auth real

Notas técnicas que sobrevivieron a la sesión en la que el frontend dejó de
usar tipos propios en inglés (`lib/api.ts` manual) y mocks de usuario para
pasar a `@dpages/shared` y Firebase Auth real. Se conserva lo que no es
obvio leyendo el código actual — no un registro completo de esa sesión.

## Por qué `FIREBASE_ADMIN_SDK_KEY_JSON` no hace falta para verificar tokens

`packages/backend/src/http/auth-firebase.ts` tiene **dos apps de Firebase
separadas**, con propósitos distintos:

1. `obtenerAppFirebase()` — la que usa `verificarTokenFirebase` en **cada**
   petición de negocio. Se inicializa con `initializeApp()` sin ningún
   argumento de credencial (Application Default Credentials): en Cloud Run
   alcanza con el service account de la instancia; en local, sólo hace falta
   `GOOGLE_APPLICATION_CREDENTIALS` (variable estándar del SDK de Google, no
   propia del proyecto) si alguna vez se prueba contra el proyecto real con
   `AUTH_DISABLED=false`. `verificarTokenFirebase` sólo llama a
   `getAuth(app).verifyIdToken(token)`, que ya valida firma, expiración y
   `aud`/`iss` contra las claves públicas de Google — no hay nada más que
   chequear ahí.
2. `obtenerAppFirebaseAdmin()` — usada **sólo** por `gestioUsuarisFirebase`
   (`crearUsuari`/`esborrarUsuari`/`generarLinkEstabliment`, `POST
/usuaris`). Esta sí necesita `FIREBASE_ADMIN_SDK_KEY_JSON` (credencial
   explícita, `cert()`): Identity Toolkit gestiona sus propios permisos por
   fuera de IAM de GCP, y el service account de la instancia de Cloud Run no
   tiene acceso real ahí pese a sus roles de IAM a nivel de proyecto.

Conclusión práctica: para verificar tokens (toda ruta de negocio salvo `POST
/usuaris`) no hace falta generar ni pegar `FIREBASE_ADMIN_SDK_KEY_JSON` — esa
variable sigue siendo específica de `POST /usuaris`, tal como ya lo dice el
comentario de `.env.example`.

## `/users` sigue desconectada del modelo real de roles

La pantalla `/users` (`useUsers.ts`, `UserFormModal.tsx`, `users/page.tsx`)
quedó sobre su modelo de mock original (4 roles fijos
`office`/`workshop`/`packaging`/`production`, con `password` en texto
plano) incluso después de migrar el resto del frontend a `@dpages/shared` —
el usuario autenticado real (`useAuth.tsx`) usa `UsuariApi`
(`rol: {id, nom, modulsPermesos}`, sin roles fijos ni contraseña), pero
`/users` como pantalla de administración no se migró en la misma sesión.
Verificar el estado actual antes de asumir que sigue así.
