import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Code2, Shield, Zap, Github, Key, ExternalLink, Loader2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginWithDerivToken } from "@/lib/deriv.functions";

const DERIV_OAUTH_URL = "https://oauth.deriv.com/oauth2/authorize";
const DERIV_API_TOKEN_URL = "https://app.deriv.com/account/api-token";

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

type Tab = "oauth" | "token";

function LoginPage() {
  const { appId, redirectUri, authenticated } = Route.useLoaderData();
  const navigate = useNavigate();
  const login = useServerFn(loginWithDerivToken);

  const [tab, setTab] = useState<Tab>("oauth");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authenticated) {
    if (typeof window !== "undefined") window.location.replace("/apps");
  }

  const handleSignIn = () => {
    const url = new URL(DERIV_OAUTH_URL);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("l", "EN");
    window.location.href = url.toString();
  };

  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      const res = await login({ data: { token: trimmed } });
      if (res.ok) {
        navigate({ to: "/apps", replace: true });
      } else {
        setError(res.error || "Invalid token. Please check and try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
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

          {/* Tabs */}
          <div className="mt-6 flex rounded-lg border border-border bg-muted p-1 text-sm font-medium">
            <button
              onClick={() => { setTab("oauth"); setError(null); }}
              className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                tab === "oauth"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              OAuth Sign-in
            </button>
            <button
              onClick={() => { setTab("token"); setError(null); }}
              className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                tab === "token"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              API Token
            </button>
          </div>

          {tab === "oauth" && (
            <div className="mt-5">
              <Button
                onClick={handleSignIn}
                size="lg"
                className="w-full text-base font-medium"
              >
                Sign in with Deriv
              </Button>
              <div className="mt-5 grid grid-cols-1 gap-3 text-xs text-muted-foreground">
                <Feature icon={Shield} label="OAuth via Deriv — token stored in HTTP-only cookie" />
                <Feature icon={Zap} label="Live data over the official Deriv WebSocket API" />
                <Feature icon={Github} label="Read-only — no writes to your applications" />
              </div>
            </div>
          )}

          {tab === "token" && (
            <div className="mt-5">
              {/* Instructions */}
              <div className="rounded-xl border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">How to create an API token</p>
                <ol className="mt-2 space-y-1.5 list-decimal list-inside">
                  <li>
                    Go to{" "}
                    <a
                      href={DERIV_API_TOKEN_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                    >
                      app.deriv.com → Account → API Token
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Enter a token name (e.g. "DevHub")</li>
                  <li>
                    Enable the{" "}
                    <span className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary">
                      Application insight
                    </span>{" "}
                    scope (and optionally <span className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary">Read</span>)
                  </li>
                  <li>Click <strong>Create</strong> and copy the token</li>
                </ol>
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
                  <strong>Note:</strong> Use the token from <strong>app.deriv.com</strong> (looks like 15 random characters).
                  Tokens from <em>developers.deriv.com</em> starting with <code className="font-mono">pat_</code> are for the new platform and cannot access app listings yet.
                </div>
              </div>

              {/* Token input form */}
              <form onSubmit={handleTokenLogin} className="mt-4 space-y-3">
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Paste your API token here"
                    value={token}
                    onChange={(e) => { setToken(e.target.value); setError(null); }}
                    className="pl-9 font-mono text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-base font-medium"
                  disabled={!token.trim() || loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying token…
                    </>
                  ) : (
                    "Sign in with API token"
                  )}
                </Button>
              </form>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                Your token is sent directly to Deriv's API and stored in an HTTP-only cookie.
              </p>
            </div>
          )}
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
