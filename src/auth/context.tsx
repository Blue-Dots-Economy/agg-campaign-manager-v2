import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  GENERIC_LOGIN_ERROR,
  login as loginFn,
  logout as logoutFn,
  me as meFn,
  TOO_MANY_ATTEMPTS,
  type AuthProvider as AuthFlow,
  type SessionUser,
} from "@/lib/auth.functions";
import type { Role } from "@/auth/roles";

export type { Role, AuthFlow };

// Session is the httpOnly cm_session cookie; the user comes from me().
export type Session = SessionUser;

type AuthContextValue = {
  session: Session | null;
  // null until me() has answered, or if the server could not be reached.
  authProvider: AuthFlow | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<Session | null>;
};

export type LoginResult = { session: Session } | { error: string };

// Only these server messages are shown as they are; anything else gets the generic one.
const SHOWN_LOGIN_ERRORS = [GENERIC_LOGIN_ERROR, TOO_MANY_ATTEMPTS];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authProvider, setAuthProvider] = useState<AuthFlow | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const queryClient = useQueryClient();
  const callMe = useServerFn(meFn);
  const callLogin = useServerFn(loginFn);
  const callLogout = useServerFn(logoutFn);

  const refresh = useCallback(async () => {
    let s: Session | null = null;
    try {
      const res = await callMe();
      setAuthProvider(res.authProvider);
      if (res.loggedIn) {
        const { loggedIn: _l, authProvider: _a, ...user } = res;
        s = user;
      }
    } catch {
      /* server unreachable */
    }
    setSession(s);
    return s;
  }, [callMe]);

  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      await callLogin({ data: { email, password } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      return { error: SHOWN_LOGIN_ERRORS.includes(message) ? message : GENERIC_LOGIN_ERROR };
    }
    queryClient.clear();
    const s = await refresh();
    return s ? { session: s } : { error: GENERIC_LOGIN_ERROR };
  };

  // A full page load to wherever logout points, which also clears all client state.
  const logout = async () => {
    let redirectTo = "/login";
    try {
      ({ redirectTo } = await callLogout());
    } catch {
      /* already signed out */
    }
    setSession(null);
    queryClient.clear();
    window.location.assign(redirectTo);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        authProvider,
        isAuthenticated: !!session,
        isAdmin: session?.role === "admin",
        hydrated,
        login,
        logout,
        refresh,
      }}
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
