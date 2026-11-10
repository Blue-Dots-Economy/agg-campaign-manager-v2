import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/auth/context";
import { landingFor } from "@/auth/permissions";

// Passwords are not used: people sign in with Keycloak. An old link or bookmark
// goes to the user's own page.
export const Route = createFileRoute("/change-password")({
  component: ChangePasswordRedirect,
});

function ChangePasswordRedirect() {
  const { session } = useAuth();
  return <Navigate to={landingFor(session?.role)} />;
}
