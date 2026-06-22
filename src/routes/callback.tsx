import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

import { loginWithDerivToken } from "@/lib/deriv.functions";

export const Route = createFileRoute("/callback")({
  head: () => ({ meta: [{ title: "Signing in… — Deriv DevHub" }] }),
  component: CallbackPage,
});

type Status = "loading" | "success" | "error";

function CallbackPage() {
  const navigate = useNavigate();
  const login = useServerFn(loginWithDerivToken);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("Completing sign-in…");

  useEffect(() => {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const token = params.get("token1");
    const loginid = params.get("acct1") ?? undefined;
    const currency = params.get("cur1") ?? undefined;

    if (!token) {
      setStatus("error");
      setMessage(
        "No Deriv token was returned in the callback URL. The OAuth flow may have been cancelled.",
      );
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await login({ data: { token, loginid, currency } });
        if (cancelled) return;
        if (res.ok) {
          // Wipe sensitive query string from history before navigating
          window.history.replaceState({}, "", "/callback");
          setStatus("success");
          setMessage("Signed in. Redirecting…");
          setTimeout(() => navigate({ to: "/apps", replace: true }), 600);
        } else {
          setStatus("error");
          setMessage(res.error || "Failed to verify Deriv token.");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Unexpected error during sign-in.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [login, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        {status === "loading" && (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        )}
        {status === "success" && (
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
        )}
        {status === "error" && (
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
        )}
        <h1 className="mt-4 text-lg font-semibold">
          {status === "loading" && "Signing you in"}
          {status === "success" && "Welcome back"}
          {status === "error" && "Sign-in failed"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {status === "error" && (
          <a
            href="/login"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Back to sign in
          </a>
        )}
      </div>
    </div>
  );
}
