# infra/gcp

Placeholder para scripts de aprovisionamiento de Cloud Run, Cloud SQL, Secret
Manager y Cloud Scheduler. Se completa cerca de la puesta en producción
(objetivo: finales de septiembre de 2026).

Región prevista: europe-west1 o europe-southwest1 (RGPD — los datos de
ciudadanos españoles no salen de la UE).

Recursos a aprovisionar:

- **Cloud Run** — backend (`packages/backend/Dockerfile`).
- **Cloud SQL para PostgreSQL** — mismo esquema que en local, aplicado vía
  `npm run migrate`.
- **Secret Manager** — credenciales de WooCommerce de sólo lectura, secreto
  del endpoint de tareas, credenciales de base de datos.
- **Cloud Scheduler** — dispara `POST /tasques/sync-comandes`,
  `/sync-cataleg` y `/reconciliar` (ver ADR-009 en
  `docs/decisiones-arquitectura.md`).
- **Firebase Auth** — autenticación de los cuatro paneles; sin datos de
  negocio.
