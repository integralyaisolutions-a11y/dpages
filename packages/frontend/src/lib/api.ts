// Cliente HTTP base para hablar con el backend real de dPagès.
//
// Regla de tipos del proyecto: TODO tipo de dato que viaja entre frontend
// y backend se define acá, con el sufijo `Api` (ej. `ComandaApi`,
// `ProducteApi`, `ClientApi`, `TarifaApi`). Ningún otro archivo del
// frontend debe declarar sus propios tipos de dominio sueltos
// (nada de catalog.ts, comanda.ts, client.ts fuera de este archivo):
// eso duplicaría el contrato y lo desincroniza del backend.
//
// Los componentes de UI nunca deben llamar fetch() directamente contra
// el backend: pasan siempre por un hook de /hooks, que a su vez usa las
// funciones de este archivo.
//
// TODO: definir baseUrl (env var), manejo de auth (token Firebase),
// manejo de errores y los tipos *Api reales cuando cierre el contrato
// con el backend.

export {};
