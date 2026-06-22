import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, LogOut, Code2, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { logout } from "@/lib/deriv.functions";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  user?: { loginid?: string; email?: string } | null;
}

export function AppShell({ children, user }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const logoutFn = useServerFn(logout);
  const logoutMut = useMutation({
    mutationFn: () => logoutFn(),
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.clear();
      window.location.href = "/login";
    },
  });

  const nav = [{ to: "/apps", label: "Applications", icon: LayoutGrid }];

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Code2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Deriv DevHub</span>
            <span className="text-[11px] text-muted-foreground">Applications</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <a
            href="https://api.deriv.com/api-explorer"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Deriv API Explorer
          </a>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur px-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Code2 className="h-4 w-4" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              Developer Applications
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {user?.loginid && (
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-xs font-medium">{user.loginid}</span>
                {user.email && (
                  <span className="text-[11px] text-muted-foreground">{user.email}</span>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMut.mutate()}
              disabled={logoutMut.isPending}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>
        <main className="flex-1 px-4 md:px-8 py-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
