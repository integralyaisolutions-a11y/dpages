"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UserApi } from "@/lib/api";
import { getMockUsers, validateCredentials } from "@/mocks/users";

const SESSION_STORAGE_KEY = "dpages_session";

export type LoginResult = { ok: true; user: UserApi } | { ok: false; reason: "invalid" | "inactive" };

type AuthContextValue = {
  user: UserApi | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);

    // TODO: al conectar Firebase Auth real, hidratar la sesión validando el
    // token en vez de buscar el id guardado contra el mock de usuarios.
    const hydrate = sessionId
      ? getMockUsers().then((users) => users.find((item) => item.id === sessionId) ?? null)
      : Promise.resolve(null);

    hydrate
      .then((found) => {
        if (!cancelled) setUser(found);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    // TODO: sustituir por signInWithEmailAndPassword de Firebase Auth cuando exista backend real.
    const result = await validateCredentials(email, password);
    if (!result.ok) return result;
    window.localStorage.setItem(SESSION_STORAGE_KEY, result.user.id);
    setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
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
