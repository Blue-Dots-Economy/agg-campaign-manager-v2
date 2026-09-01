import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { useReviewers } from "@/programs/useProgramAggregates";
import { addReviewer, removeReviewer } from "@/lib/reviewers.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/Panel";

export function ReviewersSection() {
  const qc = useQueryClient();
  const { data: reviewers } = useReviewers();
  const addFn = useServerFn(addReviewer);
  const removeFn = useServerFn(removeReviewer);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const list = reviewers ?? [];

  async function add() {
    const e = email.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error("Enter a valid email."); return; }
    if (list.includes(e)) { toast.message("Already a reviewer."); return; }
    setBusy(true);
    try {
      const res = await addFn({ data: { email: e } });
      if (res?.ok) { toast.success(`Added ${e}`); setEmail(""); qc.invalidateQueries({ queryKey: ["reviewers"] }); }
      else toast.error("Couldn't add reviewer.");
    } catch { toast.error("Couldn't add reviewer."); } finally { setBusy(false); }
  }
  async function remove(e: string) {
    setBusy(true);
    try {
      const res = await removeFn({ data: { email: e } });
      if (res?.ok) { toast.success(`Removed ${e}`); qc.invalidateQueries({ queryKey: ["reviewers"] }); }
      else toast.error("Couldn't remove reviewer.");
    } catch { toast.error("Couldn't remove reviewer."); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Reviewers</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage who can sign in to review calls. Reviewers sign in with their email (no password); admins use the admin password.</p>
      </div>

      <Panel title="Add a reviewer" description="Enter a work email to grant review access.">
        <form onSubmit={(ev) => { ev.preventDefault(); add(); }} className="flex gap-2">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@bluedots.com" className="flex-1" />
          <Button type="submit" disabled={busy} className="gap-1.5"><UserPlus className="h-4 w-4" /> Add</Button>
        </form>
      </Panel>

      <Panel title={`Reviewers (${list.length})`}>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No reviewers yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((e) => (
              <li key={e} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-foreground">{e}</span>
                <button onClick={() => remove(e)} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50" title="Remove reviewer">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
