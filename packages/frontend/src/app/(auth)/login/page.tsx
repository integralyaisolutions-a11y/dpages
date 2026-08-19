// Página de login.
//
// Vive dentro del grupo de rutas (auth) para que quede claro qué
// páginas no requieren sesión y para poder darles un layout propio
// (sin nav de panel) el día que haga falta. El grupo no agrega
// segmento a la URL: esta página cuelga de /login.
//
// TODO: formulario de login contra Firebase Auth y redirección según
// el rol (oficina / obrador / empaquetado / producció) que venga en
// el token.

export default function LoginPage() {
  return <div>Iniciar sessió</div>;
}
