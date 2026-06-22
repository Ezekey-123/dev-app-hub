import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Globe,
  Github,
  Smartphone,
  Apple,
  CalendarClock,
  TrendingUp,
} from "lucide-react";

import { getApp, type AppRecord } from "@/lib/deriv.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RawJson } from "@/components/RawJson";

export const Route = createFileRoute("/apps/$appId")({
  parseParams: ({ appId }) => {
    const n = Number(appId);
    if (!Number.isInteger(n) || n <= 0) throw notFound();
    return { appId: n };
  },
  stringifyParams: ({ appId }) => ({ appId: String(appId) }),
  head: ({ params }) => ({
    meta: [{ title: `App ${params.appId} — Deriv DevHub` }],
  }),
  component: AppDetailPage,
});

function AppDetailPage() {
  const { appId } = Route.useParams();
  const getAppFn = useServerFn(getApp);
  const query = useQuery({
    queryKey: ["app", appId],
    queryFn: () => getAppFn({ data: { appId } }),
  });

  if (query.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (query.isError || !query.data?.app) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <h2 className="mt-3 text-base font-semibold">Couldn't load this application</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.error instanceof Error
            ? query.error.message
            : "The application was not found or you don't have access to it."}
        </p>
        <Link
          to="/apps"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </Link>
      </div>
    );
  }

  const app = query.data.app as AppRecord;
  const markup = query.data.markup as
    | { transactions?: any[]; total_app_markup?: number }
    | null;

  const isActive = app.active === undefined ? true : Boolean(app.active);

  // Dynamically pick metadata fields that exist on the response.
  const metadataKnown = new Set([
    "app_id",
    "name",
    "active",
    "scopes",
    "redirect_uri",
    "verification_uri",
    "homepage",
    "github",
    "appstore",
    "googleplay",
    "app_markup_percentage",
  ]);
  const extra = Object.entries(app).filter(
    ([k, v]) => !metadataKnown.has(k) && v !== null && v !== undefined && v !== "",
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/apps"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All applications
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {app.name ?? `App ${app.app_id}`}
            </h2>
            <p className="text-sm text-muted-foreground">App ID · {app.app_id}</p>
          </div>
          <Badge
            variant="outline"
            className={
              isActive
                ? "border-success/40 bg-success/10 text-success"
                : "border-muted-foreground/30 text-muted-foreground"
            }
          >
            {isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="Name" value={app.name} />
          <Detail label="App ID" value={app.app_id} mono />
          <Detail label="Redirect URI" value={app.redirect_uri} mono full />
          <Detail label="Verification URI" value={app.verification_uri} mono full />
          {typeof app.app_markup_percentage === "number" && (
            <Detail
              label="Markup percentage"
              value={`${app.app_markup_percentage}%`}
            />
          )}
          {Array.isArray(app.scopes) && app.scopes.length > 0 && (
            <div className="sm:col-span-2">
              <Label>Scopes</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {app.scopes.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics — only render fields actually returned. */}
      {markup && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Markup statistics (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {typeof markup.total_app_markup === "number" && (
              <Stat
                icon={TrendingUp}
                label="Total app markup"
                value={markup.total_app_markup.toLocaleString()}
              />
            )}
            {Array.isArray(markup.transactions) && (
              <Stat
                icon={CalendarClock}
                label="Transactions"
                value={markup.transactions.length.toLocaleString()}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Links */}
      {(app.homepage || app.github || app.appstore || app.googleplay) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {app.homepage && (
              <LinkBadge href={app.homepage} icon={Globe} label="Homepage" />
            )}
            {app.github && <LinkBadge href={app.github} icon={Github} label="GitHub" />}
            {app.appstore && (
              <LinkBadge href={app.appstore} icon={Apple} label="App Store" />
            )}
            {app.googleplay && (
              <LinkBadge href={app.googleplay} icon={Smartphone} label="Google Play" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Extra metadata returned by Deriv that we don't have a dedicated UI for */}
      {extra.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Additional metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {extra.map(([k, v]) => (
              <Detail
                key={k}
                label={k.replace(/_/g, " ")}
                value={typeof v === "object" ? JSON.stringify(v) : String(v)}
                mono={typeof v !== "string"}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <RawJson data={query.data.raw} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function Detail({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: unknown;
  mono?: boolean;
  full?: boolean;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label>{label}</Label>
      <p
        className={`mt-1 break-words text-sm ${mono ? "font-mono" : ""}`}
        title={String(value)}
      >
        {String(value)}
      </p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function LinkBadge({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </a>
  );
}
