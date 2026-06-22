import { createFileRoute } from "@tanstack/react-router";
import { Code2, Shield, Zap, Github } from "lucide-react";

import { Button } from "@/components/ui/button";

const DERIV_OAUTH_URL = "https://oauth.deriv.com/oauth2/authorize";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Deriv Developer Dashboard" },
      {
        name: "description",
        content:
          "Sign in with your Deriv developer account to view your registered applications.",
      },
    ],
  }),
  loader: async () => {
    const { getSession } = await import("@/lib/deriv.functions");
    return getSession();
  },
  component: LoginPage,
});

function LoginPage() {
  const { appId, authenticated } = Route.useLoaderData();

  if (authenticated) {
    // Soft redirect without throw — keeps SSR simple
    if (typeof window !== "undefined") window.location.replace("/apps");
  }

  const handleSignIn = () => {
    const url = new URL(DERIV_OAUTH_URL);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("l", "EN");
    window.location.href = url.toString();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--color-primary) 18%, transparent), transparent), radial-gradient(40% 40% at 10% 100%, color-mix(in oklch, var(--color-primary) 12%, transparent), transparent)",
        }}
      />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground glow-primary">
            <Code2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Deriv DevHub</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
            Deriv Developer Dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your Deriv account to manage and inspect every application registered
            under your developer profile.
          </p>

          <Button
            onClick={handleSignIn}
            size="lg"
            className="mt-6 w-full text-base font-medium"
          >
            Sign in with Deriv
          </Button>

          <div className="mt-6 grid grid-cols-1 gap-3 text-xs text-muted-foreground">
            <Feature icon={Shield} label="OAuth via Deriv — token stored in HTTP-only cookie" />
            <Feature icon={Zap} label="Live data over the official Deriv WebSocket API" />
            <Feature icon={Github} label="Read-only — no writes to your applications" />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in you agree to Deriv's terms of service.
        </p>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-primary" />
      <span>{label}</span>
    </div>
  );
}
