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
  DialogDescription,
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
  setAppUserActive,
  approveAppUser,
  rejectAppUser,
  unlinkKeycloakAccount,
  setUpKeycloakLogin,
  type AppUser,
} from "@/lib/auth.functions";
import { isRole, type Role } from "@/auth/roles";
import { useAuth } from "@/auth/context";
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

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function UsersRolesSection() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const updateFn = useServerFn(updateAppUser);
  const activeFn = useServerFn(setAppUserActive);
  const approveFn = useServerFn(approveAppUser);
  const rejectFn = useServerFn(rejectAppUser);
  const unlinkFn = useServerFn(unlinkKeycloakAccount);
  const setUpFn = useServerFn(setUpKeycloakLogin);

  const { data: users, isLoading } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listFn(),
  });
  const waiting = (users ?? []).filter((u) => u.state === "pending" || u.state === "rejected");
  const members = (users ?? []).filter((u) => u.state === "active" || u.state === "deactivated");

  const [open, setOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [approving, setApproving] = useState<AppUser | null>(null);
  const [approveRole, setApproveRole] = useState<Role>("user");

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
      if (editingEmail) await updateFn({ data });
      else await createFn({ data });
    },
    onSuccess: () => {
      toast.success(editingEmail ? "User updated" : "User added. They can sign in with Keycloak now.");
      setOpen(false);
      refresh();
    },
    onError: (e) => toast.error(errorText(e, "Failed to save user")),
  });

  const useUserAction = (run: (email: string) => Promise<unknown>, done: string | ((email: string) => string)) =>
    useMutation({
      mutationFn: run,
      onSuccess: (_d, email) => {
        toast.success(typeof done === "function" ? done(email) : done);
        refresh();
      },
      onError: (e) => toast.error(errorText(e, "Failed to update user")),
    });

  const toggleActive = useMutation({
    mutationFn: (v: { email: string; active: boolean }) => activeFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.active ? "User reactivated" : "User deactivated");
      refresh();
    },
    onError: (e) => toast.error(errorText(e, "Failed to update user")),
  });
  const reject = useUserAction((email) => rejectFn({ data: { email } }), "Request rejected");
  // An admin isn't linked again at login, so say what to do next.
  const unlink = useUserAction(
    (email) => unlinkFn({ data: { email } }),
    (email) =>
      users?.find((u) => u.email === email)?.role === "admin"
        ? "Keycloak login unlinked. Use Set up login to link this admin again."
        : "Keycloak login unlinked",
  );
  const setUp = useUserAction((email) => setUpFn({ data: { email } }), "Keycloak login set up");
  const approve = useMutation({
    mutationFn: (v: { email: string; role: Role }) => approveFn({ data: v }),
    onSuccess: () => {
      toast.success("Approved. They can sign in now.");
      setApproving(null);
      refresh();
    },
    onError: (e) => toast.error(errorText(e, "Failed to approve")),
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
      role: u.role ?? EMPTY.role,
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
      description="People sign in with Keycloak. Add them here to give them a role; their Keycloak account is created if they don't have one."
    >
      {waiting.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-medium text-foreground">Waiting for approval</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waiting.map((u) => (
                  <TableRow key={u.email}>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell className="text-sm">{u.name || "—"}</TableCell>
                    <TableCell className="text-xs">{u.state === "rejected" ? "Rejected" : "Signed in, waiting for approval"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setApproveRole("user");
                          setApproving(u);
                        }}
                      >
                        Approve
                      </Button>
                      {u.state === "pending" && (
                        <Button variant="ghost" size="sm" disabled={reject.isPending} onClick={() => reject.mutate(u.email)}>
                          Reject
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

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
            {!isLoading && members.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
            {members.map((u) => (
              <TableRow key={u.email} className={u.state === "active" ? "" : "opacity-60"}>
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
                  {u.keycloak_linked ? (
                    u.email !== session?.email && (
                      <Button variant="ghost" size="sm" disabled={unlink.isPending} onClick={() => unlink.mutate(u.email)}>
                        Unlink Keycloak
                      </Button>
                    )
                  ) : (
                    <Button variant="ghost" size="sm" disabled={setUp.isPending} onClick={() => setUp.mutate(u.email)}>
                      Set up login
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggleActive.isPending}
                    onClick={() => toggleActive.mutate({ email: u.email, active: u.state !== "active" })}
                  >
                    {u.state === "active" ? "Deactivate" : "Reactivate"}
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
                They sign in with Keycloak using this email and a one-time code. If they have no Keycloak account, one is
                created with this email.
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

      <Dialog open={!!approving} onOpenChange={(v) => !v && setApproving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve access</DialogTitle>
            <DialogDescription>
              Choose a role for <span className="font-mono text-foreground">{approving?.email}</span>. They can sign in
              as soon as you approve.
            </DialogDescription>
          </DialogHeader>
          <Select value={approveRole} onValueChange={(v) => isRole(v) && setApproveRole(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>Cancel</Button>
            <Button
              disabled={approve.isPending}
              onClick={() => approving && approve.mutate({ email: approving.email, role: approveRole })}
            >
              {approve.isPending ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function statusOf(u: AppUser): string {
  if (u.state === "deactivated") return "Deactivated";
  if (!u.keycloak_linked) return "No Keycloak login";
  if (!u.last_login_at) return "Active · not signed in yet";
  return `Active · last signed in ${new Date(u.last_login_at).toLocaleDateString()}`;
}
