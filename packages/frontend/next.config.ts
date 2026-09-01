import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sólo afecta "next build" (genera .next/standalone con un server.js
  // autocontenido y node_modules mínimos) — "next dev" lo ignora por
  // completo, no cambia nada del flujo de desarrollo local.
  output: "standalone",
};

export default nextConfig;
