// Inicialización de Firebase Auth.
//
// Firebase se usa SOLO para autenticación (JWT con rol embebido:
// oficina / obrador / empaquetado / producció). Ningún dato de negocio
// vive acá ni se guarda en Firebase.
//
// TODO: inicializar la app de Firebase con la config del proyecto,
// exponer el cliente de auth y el helper para leer el rol del usuario
// desde el token.

export {};
