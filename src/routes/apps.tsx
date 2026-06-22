import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/apps")({
  loader: async () => {
    const { getSession } = await import("@/lib/deriv.functions");
    const session = await getSession();
    if (!session.authenticated) {
      throw redirect({ to: "/login" });
    }
    return session;
  },
  component: AppsLayout,
});

function AppsLayout() {
  const session = Route.useLoaderData();
  const user = session.authenticated
    ? { loginid: session.loginid, email: session.email }
    : null;
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
