# dPagès — Infraestructura base en Google Cloud

**Para: Michel · De: Gerardo · 16 de agosto de 2026**

---

## 0. Qué es esto y qué no es

Esto **no es** el despliegue del sistema. El backend todavía no está listo para
desplegarse (falta terminar los endpoints de negocio). Lo que vas a hacer hoy es
construir la **base** donde ese despliegue va a vivir más adelante: la
infraestructura vacía, configurada y lista.

Cuando el backend esté terminado, conectamos ambas cosas. Hoy nadie va a tocar
datos reales de dPagès ni nada en producción.

**Tiempo estimado:** una hora y media, quizás dos si es la primera vez que usás
la consola de Google Cloud.

---

## 1. Antes de empezar

### 1.1 Acceso al proyecto

Necesitás que Eloy te dé acceso al proyecto de Google Cloud llamado **`dpages`**.
Pedile rol de **Editor** sobre ese proyecto. Sin eso no podés avanzar con nada de
lo que sigue — es lo primero que hay que resolver.

### 1.2 Instalar la herramienta de línea de comandos (gcloud CLI)

Vamos a usar comandos en vez de clickear en la consola web, porque son más
rápidos de ejecutar y más fáciles de repetir si algo sale mal.

```powershell
winget install --id Google.CloudSDK
```

Reiniciá PowerShell después de instalar. Verificá:

```powershell
gcloud --version
```

### 1.3 Autenticarte

```powershell
gcloud auth login
```

Se abre el navegador, iniciás sesión con la cuenta de Google que Eloy autorizó
sobre el proyecto.

### 1.4 Confirmar que ves el proyecto

```powershell
gcloud projects describe dpages
```

Si te devuelve información del proyecto (nombre, número, estado `ACTIVE`), estás
lista para seguir. Si da error de permisos, volvé al punto 1.1 — Eloy todavía no
te dio acceso.

Fijá el proyecto como el que vas a usar en todos los comandos siguientes:

```powershell
gcloud config set project dpages
```

---

## 2. La región — ya decidida, no hace falta elegir

Todo lo que crees va en **`europe-west1`** (Bélgica). Esta decisión ya está
tomada y documentada en el proyecto (`docs/decisiones-arquitectura.md`), por una
razón concreta: el sistema va a guardar datos personales de clientes españoles
(nombres, direcciones, teléfonos, NIF), y la normativa europea de protección de
datos (RGPD) requiere que esos datos vivan en infraestructura europea.

No cambies esto por tu cuenta. Si en algún paso la consola te ofrece elegir
región, siempre `europe-west1`.

```powershell
gcloud config set compute/region europe-west1
```

---

## 3. Habilitar las APIs necesarias

Google Cloud tiene todo apagado por defecto. Hay que encender los servicios que
vamos a usar:

```powershell
gcloud services enable `
  run.googleapis.com `
  sqladmin.googleapis.com `
  secretmanager.googleapis.com `
  cloudscheduler.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  iam.googleapis.com
```

Tarda uno o dos minutos. No debería dar ningún error — si te falta el rol de
Editor, es la señal más clara de que hay que volver al punto 1.1.

---

## 4. Repositorio de imágenes Docker (Artifact Registry)

Es donde va a vivir la imagen del backend cuando esté lista para desplegarse.
Pensalo como un almacén privado de "cajas cerradas" con el programa adentro.

```powershell
gcloud artifacts repositories create dpages-backend `
  --repository-format=docker `
  --location=europe-west1 `
  --description="Imágenes Docker del backend de dPagès"
```

Verificá que se creó:

```powershell
gcloud artifacts repositories list
```

---

## 5. Base de datos (Cloud SQL — PostgreSQL)

Esta es la pieza más importante del día. Es la versión "en la nube" del Postgres
que Gerardo tiene corriendo en Docker en su máquina. Al final del proceso, va a
tener exactamente las mismas tablas — pero eso lo hace Gerardo después, con las
migraciones. Hoy solo creamos la instancia vacía.

```powershell
gcloud sql instances create dpages-db `
  --database-version=POSTGRES_16 `
  --tier=db-g1-small `
  --region=europe-west1 `
  --storage-size=10GB `
  --storage-auto-increase `
  --availability-type=zonal `
  --root-password=GENERAR_UNA_CONTRASEÑA_FUERTE_ACA
```

**Importante sobre la contraseña:** no la dejes con ese texto literal. Generá
una contraseña larga y aleatoria — podés usar un gestor de contraseñas, o este
comando de PowerShell para generar una:

```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | % {[char]$_})
```

Copiá esa contraseña a un lugar seguro (un gestor de contraseñas compartido con
Gerardo, no un chat). La vamos a necesitar en el paso 7.

Este comando tarda **entre 5 y 10 minutos** en completarse. Es normal, Google
está aprovisionando una máquina real.

Cuando termine, creá la base de datos dentro de la instancia:

```powershell
gcloud sql databases create dpages --instance=dpages-db
```

Verificá:

```powershell
gcloud sql instances describe dpages-db --format="value(state)"
```

Debe decir `RUNNABLE`.

---

## 6. Cuenta de servicio para el backend

Es la "identidad" que va a usar el programa del backend cuando corra en la nube,
para poder leer las contraseñas guardadas y conectarse a la base de datos. No es
una persona, es una cuenta técnica.

```powershell
gcloud iam service-accounts create dpages-backend `
  --display-name="dPagès Backend"
```

Dale permiso para conectarse a Cloud SQL:

```powershell
gcloud projects add-iam-policy-binding dpages `
  --member="serviceAccount:dpages-backend@dpages.iam.gserviceaccount.com" `
  --role="roles/cloudsql.client"
```

---

## 7. Guardar las contraseñas de forma segura (Secret Manager)

Nada de contraseñas ni claves en archivos de texto o en el código. Van todas
acá, en una bóveda de Google diseñada para eso.

### 7.1 La contraseña de la base de datos

```powershell
$passwordDb = Read-Host "Pegá la contraseña de Cloud SQL del paso 5" -AsSecureString
$passwordPlano = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordDb))
$passwordPlano | gcloud secrets create db-password --data-file=-
```

### 7.2 Los secretos del backend (con valores temporales por ahora)

Estos dos ya existen en el `.env` local de Gerardo. Acá creamos el lugar donde
van a vivir en la nube; Gerardo va a completar el valor real más adelante,
cuando conecte el despliegue.

```powershell
"pendiente-gerardo-completa" | gcloud secrets create webhook-secret --data-file=-
"pendiente-gerardo-completa" | gcloud secrets create tasques-secret --data-file=-
```

### 7.3 Las credenciales de WooCommerce

Mismo caso — el espacio se crea ahora, el valor real lo completa Gerardo, porque
son las credenciales de solo lectura de la tienda del cliente y conviene que las
maneje quien ya las tiene:

```powershell
"pendiente-gerardo-completa" | gcloud secrets create wc-consumer-key --data-file=-
"pendiente-gerardo-completa" | gcloud secrets create wc-consumer-secret --data-file=-
```

### 7.4 Dar permiso a la cuenta de servicio para leer estos secretos

```powershell
$secretos = @("db-password", "webhook-secret", "tasques-secret", "wc-consumer-key", "wc-consumer-secret")
foreach ($secreto in $secretos) {
  gcloud secrets add-iam-policy-binding $secreto `
    --member="serviceAccount:dpages-backend@dpages.iam.gserviceaccount.com" `
    --role="roles/secretmanager.secretAccessor"
}
```

Verificá que los cinco secretos existen:

```powershell
gcloud secrets list
```

---

## 8. Autenticación (Firebase Auth)

Esto es lo único de esta lista que **sí te va a servir directamente mañana**
para tu propio trabajo de frontend, porque vas a necesitar estos datos para
integrar el login en Next.js.

1. Andá a **console.firebase.google.com**
2. **Agregar proyecto** → elegí **"dpages"** en el desplegable (es el mismo
   proyecto de Google Cloud, Firebase se conecta al que ya existe, no creamos
   uno nuevo)
3. Aceptá los términos, seguí el asistente hasta el final
4. Una vez creado, andá a **Authentication** en el menú lateral → **Comenzar**
5. En la pestaña **Sign-in method**, habilitá **Email/Password** por ahora (es
   lo mínimo para poder probar login; los roles específicos de oficina/obrador/
   empaquetado/producción se definen después)
6. Andá a **Configuración del proyecto** (el ícono de engranaje) →
   **Tus apps** → **Agregar app** → ícono de **Web** (`</>`)
7. Nombre de la app: `dpages-frontend`
8. Copiá el bloque de configuración que te muestra (`firebaseConfig`, con
   `apiKey`, `authDomain`, etc.) — lo vas a necesitar mañana para conectar
   Next.js. Guardalo en un lugar seguro, no lo subas al repositorio.

---

## 9. Qué NO hacer hoy

- **No crear el servicio de Cloud Run todavía.** No hay imagen del backend
  lista para desplegar — eso lo hace Gerardo cuando termine la capa actual.
- **No aplicar las migraciones contra esta base.** Cloud SQL queda vacía hoy;
  Gerardo la puebla cuando conecte el despliegue.
- **No usar las credenciales reales de WooCommerce.** Los placeholders del
  punto 7.3 quedan así hasta que Gerardo los complete.
- **No cambiar la región** de ningún recurso.

---

## 10. Checklist final — confirmá cada uno antes de avisar que terminaste

- [ ] `gcloud projects describe dpages` responde sin error
- [ ] Las 7 APIs del punto 3 están habilitadas
- [ ] `gcloud artifacts repositories list` muestra `dpages-backend`
- [ ] `gcloud sql instances describe dpages-db` dice `RUNNABLE`
- [ ] La base `dpages` existe dentro de la instancia
- [ ] La cuenta de servicio `dpages-backend` existe
- [ ] Los 5 secretos existen en Secret Manager
- [ ] La cuenta de servicio tiene permiso de lectura sobre los 5 secretos
- [ ] Firebase Authentication está habilitado con Email/Password
- [ ] Tenés guardado el `firebaseConfig` para usar mañana en el frontend
- [ ] La contraseña de la base de datos está guardada en un lugar seguro
      (no en un chat, no en el repositorio)

Cuando termines, avisale a Gerardo con el resultado de este checklist. Si algo
falla en el camino, mandale el mensaje de error completo — no lo resuelvas
adivinando, es mejor que lo revisemos juntos.

---

## 11. Qué sigue después de hoy

Cuando el backend termine su capa actual, Gerardo va a:

1. Construir la imagen Docker y subirla al repositorio que creaste en el
   punto 4
2. Aplicar las migraciones contra la base que creaste en el punto 5
3. Crear el servicio de Cloud Run, conectado a los secretos que creaste en el
   punto 7
4. Configurar el disparador automático (Cloud Scheduler) que sincroniza con
   WooCommerce cada cierto tiempo

Vos, del lado del frontend, vas a poder usar el `firebaseConfig` del punto 8
para tener el login funcionando en Next.js sin esperar a nada de esto — es
independiente del resto.
