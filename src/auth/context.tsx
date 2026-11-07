import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { login as loginFn, logout as logoutFn, me as meFn, type MeResult } from "@/lib/auth.functions";
import type { Role } from "@/auth/roles";

export type { Role };

// Session is the httpOnly cm_session cookie; the user comes from me().
export type Session = MeResult;

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<Session | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<Session | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const queryClient = useQueryClient();
  const callMe = useServerFn(meFn);
  const callLogin = useServerFn(loginFn);
  const callLogout = useServerFn(logoutFn);

  const refresh = useCallback(async () => {
    let s: Session | null = null;
    try {
      s = await callMe();
    } catch {
      /* 401: not signed in */
    }
    setSession(s);
    return s;
  }, [callMe]);

  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  const login = async (email: string, password: string) => {
    try {
      await callLogin({ data: { email, password } });
    } catch {
      return null;
    }
    queryClient.clear();
    return refresh();
  };

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
      value={{ session, isAuthenticated: !!session, isAdmin: session?.role === "admin", hydrated, login, logout, refresh }}
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
