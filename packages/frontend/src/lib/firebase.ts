// Inicialización de Firebase Auth.
//
// Firebase se usa SOLO para autenticación — ningún dato de negocio vive
// acá ni se guarda en Firebase (CLAUDE.md). Deliberadamente sin
// `getAnalytics`: esto es una app interna de gestión, no aporta nada acá
// y suma peso/tracking innecesario.
//
// `firebaseConfig` sale de variables de entorno `NEXT_PUBLIC_FIREBASE_*`
// (packages/frontend/.env.local) — nunca hardcodeado acá. Son públicas por
// diseño (viajan al navegador, no son secretas: la seguridad real la dan
// las reglas de Firebase/el backend, no ocultar estos valores).

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
