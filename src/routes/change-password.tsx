import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { landingFor } from "@/auth/permissions";
import { changePassword } from "@/lib/auth.functions";

const MIN_LENGTH = 10;

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const change = useServerFn(changePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const forced = !!session?.mustChangePassword;
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError(null);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (next.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    try {
      await change({ data: { currentPassword: current, newPassword: next } });
      const s = await refresh();
      navigate({ to: landingFor(s?.role) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Change password</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {forced ? "Set your own password to continue." : `At least ${MIN_LENGTH} characters.`}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field id="current" label={forced ? "Temporary password" : "Current password"} value={current} onChange={edit(setCurrent)} autoComplete="current-password" />
          <Field id="next" label="New password" value={next} onChange={edit(setNext)} autoComplete="new-password" />
          <Field id="confirm" label="Confirm new password" value={confirm} onChange={edit(setConfirm)} autoComplete="new-password" />
          {error && (
            <p role="alert" className="text-xs text-rose-600">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </Button>
          {!forced && (
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate({ to: landingFor(session?.role) })}>
              Cancel
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground" htmlFor={props.id}>{props.label}</label>
      <Input
        id={props.id}
        type="password"
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required
      />
    </div>
  );
}
