import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AuroraFlow } from "@/components/AuroraFlow";
import { useTheme, resolveDark } from "@/lib/theme";


// Served from public/, so they exist in every build. The old .asset.json pointers
// resolved to Lovable's own storage, which a self-hosted container does not have.
const LOGO = "/purple-dots-logo.png";
const LOGO_DARK = "/purple-dots-logo-dark.png";

// Reasons the Keycloak callback sends back, and what the user is told.
const MESSAGES: Record<string, string> = {
  pending: "Your access is pending. An admin needs to approve it.",
  denied: "You don't have access to Campaign Manager. Contact an admin.",
  conflict: "There is a problem with your account. Contact an admin.",
  "admin-unlinked": "Your admin account isn't set up for Keycloak login yet. Ask another admin to use Set up login for you.",
  unverified: "Your email is not verified in Keycloak. Contact an admin.",
  failed: "Login did not complete. Try again.",
  expired: "Login did not complete. Try again.",
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === "string" ? { error: search.error } : {},
  component: LoginPage,
});

function LoginPage() {
  const { error } = Route.useSearch();
  const message = error ? (MESSAGES[error] ?? MESSAGES.failed) : null;
  const { theme } = useTheme();
  const isDark = resolveDark(theme);

  return (
    <div className="relative overflow-hidden flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="rozgar-blob rozgar-anim-a" style={{ top: "-10%", left: "-5%", width: "420px", height: "420px", background: "radial-gradient(circle at center, rgba(124,58,237,0.40), transparent 70%)" }} />
        <div className="rozgar-blob rozgar-anim-b" style={{ bottom: "-15%", right: "-10%", width: "480px", height: "480px", background: "radial-gradient(circle at center, rgba(99,102,241,0.40), transparent 70%)" }} />
        <div className="rozgar-blob rozgar-anim-c" style={{ top: "30%", right: "20%", width: "360px", height: "360px", background: "radial-gradient(circle at center, rgba(167,139,250,0.30), transparent 70%)" }} />
        <AuroraFlow />
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card/90 backdrop-blur-sm p-8 shadow-sm">

        <div className="flex flex-col items-center text-center">
          <img src={isDark ? LOGO_DARK : LOGO} alt="Purple Dots" className="h-12 w-auto" />
          <h1 className="sr-only">Purple Dots</h1>
        </div>

        <div className="mt-6 space-y-4">
          {message && (
            <p role="alert" className="text-center text-sm text-rose-600">{message}</p>
          )}
          {/* Full page loads: the server redirects on to Keycloak. */}
          <Button asChild className="w-full">
            <a href="/auth/keycloak/login">Sign in</a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Not you?{" "}
            <a href="/auth/keycloak/sign-out" className="underline underline-offset-2 hover:text-foreground">
              Sign out of Keycloak
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
