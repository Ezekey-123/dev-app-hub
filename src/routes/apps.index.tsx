import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Search,
  ArrowUpDown,
  ExternalLink,
  Inbox,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { listApps, type AppRecord } from "@/lib/deriv.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RawJson } from "@/components/RawJson";

export const Route = createFileRoute("/apps/")({
  head: () => ({
    meta: [
      { title: "Applications — Deriv DevHub" },
      {
        name: "description",
        content: "All Deriv developer applications registered under your account.",
      },
    ],
  }),
  component: AppsListPage,
});

type SortKey = "name" | "app_id";

const PAGE_SIZE = 12;

function AppsListPage() {
  const qc = useQueryClient();
  const listAppsFn = useServerFn(listApps);
  const query = useQuery({
    queryKey: ["apps"],
    queryFn: () => listAppsFn(),
  });

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);

  const apps = (query.data?.apps ?? []) as AppRecord[];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? apps.filter(
          (a) =>
            (a.name ?? "").toLowerCase().includes(term) ||
            String(a.app_id ?? "").includes(term),
        )
      : apps;
    const sorted = [...list].sort((a, b) => {
      if (sort === "app_id") return (a.app_id ?? 0) - (b.app_id ?? 0);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return sorted;
  }, [apps, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginated = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Your applications</h2>
          <p className="text-sm text-muted-foreground">
            {query.isLoading
              ? "Loading from Deriv…"
              : `${apps.length} application${apps.length === 1 ? "" : "s"} registered`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or ID"
              className="w-64 pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSort((s) => (s === "name" ? "app_id" : "name"))}
          >
            <ArrowUpDown className="h-4 w-4" />
            Sort: {sort === "name" ? "Name" : "App ID"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["apps"] })}
            disabled={query.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {query.isLoading && <SkeletonGrid />}

      {query.isError && (
        <ErrorState
          message={
            query.error instanceof Error ? query.error.message : "Failed to load apps"
          }
        />
      )}

      {!query.isLoading && !query.isError && apps.length === 0 && <EmptyState />}

      {!query.isLoading && !query.isError && apps.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((app) => (
              <AppCard key={app.app_id} app={app} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Page {pageSafe} of {totalPages} · {filtered.length} result
                {filtered.length === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {query.data?.raw && <RawJson data={query.data.raw} />}
        </>
      )}
    </div>
  );
}

function AppCard({ app }: { app: AppRecord }) {
  const isActive = app.active === undefined ? true : Boolean(app.active);
  return (
    <Card className="grad-app-card group relative overflow-hidden transition-shadow hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            {app.name ?? `App ${app.app_id}`}
          </CardTitle>
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
        <p className="text-xs text-muted-foreground">App ID · {app.app_id}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {app.redirect_uri && (
          <Field label="Redirect URI" value={app.redirect_uri} mono truncate />
        )}
        {Array.isArray(app.scopes) && app.scopes.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Scopes
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {app.scopes.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2">
          <Link
            to="/apps/$appId"
            params={{ appId: String(app.app_id) }}
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            View details <ExternalLink className="h-3 w-3" />
          </Link>
          {typeof app.app_markup_percentage === "number" && (
            <span className="text-xs text-muted-foreground">
              Markup {app.app_markup_percentage}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-sm ${mono ? "font-mono" : ""} ${truncate ? "truncate" : ""}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl border border-border bg-card/60"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
      <Inbox className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 text-base font-semibold">No applications yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Register your first app at{" "}
        <a
          href="https://app.deriv.com/account/api-token"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          app.deriv.com
        </a>
        .
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
      <h3 className="mt-3 text-sm font-semibold">Couldn't load applications</h3>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
