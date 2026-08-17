# dPagès — Estado real de la infraestructura GCP al 17 de agosto de 2026

**Para: Michel · De: Gerardo**

Este documento reemplaza al `infraestructura-gcp-setup.md` original como
referencia de estado actual. Ese documento seguía siendo válido como guía de
pasos, pero fue Gerardo quien terminó ejecutando la infraestructura (no vos,
por cómo se acomodaron los tiempos el fin de semana) — así que acá está
exactamente qué quedó hecho, qué quedó a medias, y qué es tuyo para tocar.

**No hace falta que repitas ningún paso del documento original.** Todo lo de
las secciones 1 a 8 de ese documento ya está hecho. Lo único pendiente
depende de un permiso de Eloy, no de nada que vos tengas que ejecutar.

---

## 1. Lo que está completo y verificado

| Recurso                             | Estado             | Detalle                                                                                                                                  |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto GCP `dpages`               | ✅                 | Facturación activa, región `europe-west1` en todo                                                                                        |
| 7 APIs habilitadas                  | ✅                 | Run, SQL Admin, Secret Manager, Scheduler, Build, Artifact Registry, IAM                                                                 |
| Artifact Registry `dpages-backend`  | ✅                 | Repositorio Docker creado                                                                                                                |
| **Cloud SQL `dpages-db`**           | ✅                 | Postgres 16, `db-f1-micro`, zonal, `RUNNABLE`                                                                                            |
| **Esquema completo aplicado**       | ✅                 | Las 10 migraciones corridas y verificadas contra Cloud SQL real (no sólo local)                                                          |
| Cuenta de servicio `dpages-backend` | ✅ creada          | Falta el binding de permisos (ver sección 3)                                                                                             |
| 5 secretos en Secret Manager        | ✅ creados         | `db-password`, `webhook-secret`, `tasques-secret`, `wc-consumer-key`, `wc-consumer-secret` — falta el binding de lectura (ver sección 3) |
| **Firebase Auth**                   | ✅                 | Email/contraseña habilitado, app web registrada                                                                                          |
| **`firebaseConfig`**                | ✅                 | Ver sección 2 — esto es lo que necesitás hoy                                                                                             |
| **Imagen Docker**                   | ✅                 | Construida y subida a Artifact Registry, tag `v1`                                                                                        |
| Tag de Git `v1`                     | ✅                 | En ambos remotos (`origin` y `visioflow`), marca el commit exacto de la imagen                                                           |
| Servicio Cloud Run `dpages-backend` | ⚠️ creado, no sano | Ver sección 4 — es normal, no es un bug                                                                                                  |

---

## 2. `firebaseConfig` — esto es lo que necesitás para arrancar mañana

El proyecto de Firebase quedó vinculado al mismo proyecto GCP (`dpages`, con
ID interno `dpages-be46b` — Firebase le agregó un sufijo porque el nombre
corto ya estaba tomado globalmente; no afecta nada de GCP, sólo aparece en
este config).

**El config completo no va en este archivo** (aunque el `apiKey` de Firebase
es público por diseño — no es un secreto real, ver
[documentación oficial](https://firebase.google.com/support/guides/security-checklist#api-keys-not-secret)
— GitHub lo marca igual como posible secreto, y evitamos el ruido dejándolo
fuera del repo). Gerardo te lo pasa directo por [Slack/WhatsApp/el canal que
usen] — son 7 campos, se copian y pegan en dos segundos.

Para volver a obtenerlo vos misma en cualquier momento, sin depender de
Gerardo: **console.firebase.google.com** → proyecto `dpages` → ⚙️
**Configuración del proyecto** → **General** → sección **"Tus apps"** → la
app `dpages-frontend` ya registrada.

Con esto ya podés integrar el login en Next.js — es completamente
independiente de todo lo demás de este documento, no depende de ningún
permiso pendiente.

---

## 3. Lo único pendiente: dos permisos que dependen de Eloy

Al ejecutar la infraestructura, dos comandos fallaron por falta de permiso —
no por un error de configuración. La cuenta de Gerardo tiene rol Editor +
IAM Admin sobre el proyecto, pero **asignar permisos sobre recursos
(`setIamPolicy`) requiere un rol más alto** (`roles/resourcemanager.projectIamAdmin`
u Owner), que ninguna de las dos cuentas del equipo tiene hoy.

Ya se le pidió el permiso a Eloy (respondió que lo va a resolver la semana
del 17, está de vacaciones pero con acceso a su computadora). **No hace
falta que hagas nada con esto** — cuando Eloy lo resuelva, Gerardo corre los
dos comandos que faltan y el servicio de Cloud Run queda operativo. Lo dejo
documentado igual por transparencia, no como tarea tuya:

```powershell
# Pendiente 1: permiso de la cuenta de servicio para conectar a Cloud SQL
gcloud projects add-iam-policy-binding dpages `
  --member="serviceAccount:dpages-backend@dpages.iam.gserviceaccount.com" `
  --role="roles/cloudsql.client"

# Pendiente 2: permiso de la cuenta de servicio para leer los 5 secretos
$secretos = @("db-password", "webhook-secret", "tasques-secret", "wc-consumer-key", "wc-consumer-secret")
foreach ($secreto in $secretos) {
  gcloud secrets add-iam-policy-binding $secreto `
    --member="serviceAccount:dpages-backend@dpages.iam.gserviceaccount.com" `
    --role="roles/secretmanager.secretAccessor"
}
```

---

## 4. Por qué el servicio de Cloud Run existe pero está "caído" — y por qué eso está bien

Se creó el servicio `dpages-backend` en Cloud Run apuntando a la imagen
`v1`, para dejar el recurso ya registrado y no obligar a crearlo de cero más
adelante. El despliegue **falló al arrancar el contenedor** con este error:

```
The user-provided container failed to start and listen on the port
defined provided by the PORT=8080 environment variable within the
allocated timeout.
```

Esto es exactamente lo esperado: el contenedor no tiene `DATABASE_URL` ni
las demás variables de entorno todavía, porque conectarlas requiere el
mismo permiso pendiente de la sección 3 (Cloud Run necesita `setIamPolicy`
para leer un secreto en nombre del servicio). No es un bug de la imagen — la
imagen en sí compiló y se armó sin errores, sólo le falta con qué conectarse.

**Si ves el servicio con una revisión fallida en la consola, es normal.**
Nadie puede pegarle desde afuera (`--no-allow-unauthenticated`), así que no
hay ningún riesgo mientras tanto.

URL del servicio (por si hace falta referenciarla, aunque hoy no responda):
`https://dpages-backend-493716972967.europe-west1.run.app`

---

## 5. Un ajuste sobre versión de Postgres, contra la propuesta económica

La propuesta económica original especificaba `db-f1-micro` con Postgres
**15**. El proyecto se construyó desde el día uno sobre Postgres **16**
(`docker-compose.yml`, CI, `Dockerfile`) — un desalineamiento de
documentación, no una decisión técnica tomada a propósito. Se revisaron las
10 migraciones y ninguna usa sintaxis exclusiva de 16, pero se decidió
mantener 16 en Cloud SQL (mismo costo exacto, cero riesgo de divergencia
entre entornos) en vez de forzar 15. Ya se le avisó a Eloy por escrito.

Esto no te afecta directamente para el frontend, pero si en algún momento
Integraly pregunta por la versión exacta del motor, es 16, no 15.

---

## 6. Lo que sigue siendo tuyo, sin cambios

Todo esto sigue exactamente como estaba planeado — nada de lo de arriba lo
modifica:

- Frontend Next.js: arrancás con el `firebaseConfig` de la sección 2, sin
  esperar a nada más.
- El resto de `infraestructura-gcp-setup.md` (secciones 1-8) ya está hecho,
  no hace falta que repitas ningún paso ni verifiques el checklist final —
  este documento ya lo cubre.
- Los campos de agrupación del catálogo (capa 12) siguen sin construirse
  hasta después de la reunión de hoy lunes con Francesc sobre P-14.
