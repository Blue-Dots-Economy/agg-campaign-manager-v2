import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { logout as logoutFn, me as meFn, type MeResult } from "@/lib/auth.functions";
import type { Role } from "@/auth/roles";
import { SESSION_QUERY_KEY, isNotSessionQuery, loadSessionOrNull } from "@/auth/session-query";

export type { Role };

// Session is the httpOnly cm_session cookie, set by the Keycloak callback; the user comes from me().
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

/** Provides the signed-in session, read once through React Query and updated on sign-in and sign-out. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const callMe = useServerFn(meFn);
  const callLogout = useServerFn(logoutFn);

  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => loadSessionOrNull(() => callMe()),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const session = sessionQuery.data ?? null;
  const hydrated = !sessionQuery.isPending;

  const refresh = async () => {
    const s = await loadSessionOrNull(() => callMe());
    queryClient.setQueryData(SESSION_QUERY_KEY, s);
    return s;
  };

  // Drops every cached query except the session, so no data from the previous user stays on screen.
  const clearUserData = () => queryClient.removeQueries({ predicate: isNotSessionQuery });

  const logout = async () => {
    try {
      await callLogout();
    } catch {
      // Already signed out.
    }
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    clearUserData();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: !!session,
        isAdmin: session?.role === "admin",
        hydrated,
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
