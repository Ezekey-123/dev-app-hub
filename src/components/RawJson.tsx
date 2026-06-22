import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

export function RawJson({ title = "Raw API Response", data }: { title?: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40 rounded-xl"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {title}
        </span>
        <span className="text-xs text-muted-foreground">JSON</span>
      </button>
      {open && (
        <div className="relative border-t border-border">
          <button
            onClick={copy}
            type="button"
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-xs hover:bg-muted"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <pre className="max-h-[500px] overflow-auto p-4 text-xs leading-relaxed text-muted-foreground">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
