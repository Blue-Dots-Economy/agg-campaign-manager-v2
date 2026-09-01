import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/auth/context";

export function AccountMenu() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  if (!session) return null;
  const local = session.email.split("@")[0] || session.email;
  const initials = local.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1.5 pr-3 text-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-foreground text-xs font-semibold">
            {initials}
          </span>
          <span className="hidden max-w-[12rem] truncate text-muted-foreground sm:inline">{session.email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{session.email}</span>
          <span className="text-xs font-normal text-muted-foreground">{session.role === "admin" ? "Admin" : session.role === "ecosystem" ? "Ecosystem" : "Reviewer"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => { logout(); navigate({ to: "/login" }); }}
          className="text-rose-600 focus:text-rose-600"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
