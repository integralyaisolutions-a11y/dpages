"use client";

import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAuthTokenProvider, type UsuariApi } from "@/lib/api";
import { auth } from "@/lib/firebase";

// Punto de inyección del token para lib/api.ts (tarea 3 de esta sesión) —
// se resuelve acá, una sola vez, apenas se importa este módulo: cada
// petición de la capa HTTP manda el ID token vigente del usuario de
// Firebase, o ninguno si no hay sesión (el backend lo rechaza con
// 401 NO_AUTENTICAT, contrato §2).
setAuthTokenProvider(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));

export type LoginResult = { ok: true; user: UsuariApi } | { ok: false; reason: "invalid" | "inactive" };

type AuthContextValue = {
  user: UsuariApi | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** `GET /jo` — usuario autenticado con rol y mòduls permesos, contrato §4.12. Devuelve `null` si el backend lo rechaza (token vencido, usuari.actiu=false). */
async function fetchUsuariActual(): Promise<UsuariApi | null> {
  try {
    return await api.get<UsuariApi>("/jo");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UsuariApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Firebase gestiona la sesión sola (persistida por el propio SDK, no a
    // mano en localStorage) — esto reemplaza la hidratación manual de antes.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      setUser(await fetchUsuariActual());
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      return { ok: false, reason: "invalid" };
    }

    const usuari = await fetchUsuariActual();
    if (!usuari) {
      // GET /jo rechazó el token recién emitido: el caso documentado es
      // usuari.actiu=false (403 SENSE_PERMIS, contrato §4.12) — no dejamos
      // una sesión de Firebase viva si el backend no reconoce al usuario.
      await signOut(auth);
      return { ok: false, reason: "inactive" };
    }

    setUser(usuari);
    return { ok: true, user: usuari };
  }, []);

  const logout = useCallback(() => {
    void signOut(auth);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
