import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { logout as logoutFn, me as meFn, type MeResult } from "@/lib/auth.functions";
import type { Role } from "@/auth/roles";

export type { Role };

// Session is the httpOnly cm_session cookie, set by the Keycloak callback; the
// user comes from me().
export type Session = MeResult;

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hydrated: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<Session | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const queryClient = useQueryClient();
  const callMe = useServerFn(meFn);
  const callLogout = useServerFn(logoutFn);

  const refresh = useCallback(async () => {
    let s: Session | null = null;
    try {
      s = await callMe();
    } catch {
      /* server unreachable: treated as signed out */
    }
    setSession(s);
    return s;
  }, [callMe]);

  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  const logout = async () => {
    try {
      await callLogout();
    } catch {
      /* already signed out */
    }
    setSession(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider
      value={{ session, isAuthenticated: !!session, isAdmin: session?.role === "admin", hydrated, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
