import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAppUsers,
  createAppUser,
  updateAppUser,
  resetAppUserPassword,
  setAppUserActive,
  type AppUser,
} from "@/lib/auth.functions";
import { registry } from "@/programs/registry";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "jfc", label: "JFC" },
  { value: "owner", label: "Owner" },
  { value: "coordinator", label: "Coordinator" },
  { value: "ecosystem", label: "Ecosystem" },
  { value: "user", label: "Reviewer" },
];

const NONE = "__none__";

type FormState = {
  email: string;
  name: string;
  role: string;
  district: string;
  program: string;
  node_type: string;
  node_name: string;
};

const EMPTY: FormState = {
  email: "",
  name: "",
  role: "user",
  district: NONE,
  program: NONE,
  node_type: NONE,
  node_name: "",
};

export function UsersRolesSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const updateFn = useServerFn(updateAppUser);
  const resetFn = useServerFn(resetAppUserPassword);
  const activeFn = useServerFn(setAppUserActive);

  const { data: users, isLoading } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listFn(),
  });

  const [open, setOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["app-users"] });

  const save = useMutation({
    mutationFn: async () => {
      const data = {
        email: form.email.trim().toLowerCase(),
        name: form.name,
        role: form.role,
        district: form.district === NONE ? "" : form.district,
        program: form.program === NONE ? "" : form.program,
        node_type: form.node_type === NONE ? "" : form.node_type,
        node_name: form.node_name,
      };
      if (editingEmail) {
        await updateFn({ data });
        return null;
      }
      const { temporaryPassword } = await createFn({ data });
      return { email: data.email, password: temporaryPassword };
    },
    onSuccess: (created) => {
      toast.success(editingEmail ? "User updated" : "User added");
      setOpen(false);
      if (created) setIssued(created);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save user"),
  });

  const resetPassword = useMutation({
    mutationFn: async (email: string) => ({ email, password: (await resetFn({ data: { email } })).temporaryPassword }),
    onSuccess: (r) => {
      setIssued(r);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reset password"),
  });

  const toggleActive = useMutation({
    mutationFn: (v: { email: string; active: boolean }) => activeFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.active ? "User reactivated" : "User deactivated");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update user"),
  });

  const openAdd = () => {
    setEditingEmail(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (u: AppUser) => {
    setEditingEmail(u.email);
    setForm({
      email: u.email,
      name: u.name ?? "",
      role: u.role,
      district: u.district || NONE,
      program: u.program || NONE,
      node_type: u.node_type || NONE,
      node_name: u.node_name ?? "",
    });
    setOpen(true);
  };

  return (
    <Panel
      title="Users & Roles"
      description="Manage who can sign in and what each role can access."
    >
      <div className="mb-3 flex justify-end">
        <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={openAdd}>
          Add user
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>District / Program</TableHead>
              <TableHead>Node</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (users ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
            {(users ?? []).map((u) => (
              <TableRow key={u.email} className={u.active ? "" : "opacity-60"}>
                <TableCell className="font-mono text-xs">{u.email}</TableCell>
                <TableCell className="text-sm">{u.name || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-brand-soft text-brand">
                    {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[u.district, u.program].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[u.node_type, u.node_name].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell className="text-xs">{statusOf(u)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={resetPassword.isPending}
                    onClick={() => resetPassword.mutate(u.email)}
                  >
                    Reset password
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggleActive.isPending}
                    onClick={() => toggleActive.mutate({ email: u.email, active: !u.active })}
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEmail ? "Edit user" : "Add user"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="u-email" className="text-xs">Email</Label>
              <Input
                id="u-email"
                value={form.email}
                disabled={!!editingEmail}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 font-mono text-xs"
                placeholder="person@bluedots.com"
              />
            </div>
            <div>
              <Label htmlFor="u-name" className="text-xs">Name</Label>
              <Input
                id="u-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">District</Label>
              <Select value={form.district} onValueChange={(v) => setForm({ ...form, district: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  <SelectItem value="KA">KA</SelectItem>
                  <SelectItem value="GZB">GZB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Program</Label>
              <Select value={form.program} onValueChange={(v) => setForm({ ...form, program: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {Object.values(registry).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Node type</Label>
              <Select value={form.node_type} onValueChange={(v) => setForm({ ...form, node_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  <SelectItem value="College">College</SelectItem>
                  <SelectItem value="Association">Association</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="u-node" className="text-xs">Node name</Label>
              <Input
                id="u-node"
                value={form.node_name}
                onChange={(e) => setForm({ ...form, node_name: e.target.value })}
                className="mt-1"
              />
            </div>
            {!editingEmail && (
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                A temporary password is generated and shown once. The user sets their own at first sign-in.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={save.isPending || !form.email.trim()}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(v) => !v && setIssued(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Send this to <span className="font-mono text-foreground">{issued?.email}</span>. It is shown only once;
            they will be asked to change it when they sign in.
          </p>
          <Input readOnly value={issued?.password ?? ""} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(issued?.password ?? "");
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function statusOf(u: AppUser): string {
  if (!u.active) return "Inactive";
  if (u.locked) return "Locked";
  if (!u.has_password) return "No password";
  if (u.must_change_password) return "Must change password";
  return "Active";
}
