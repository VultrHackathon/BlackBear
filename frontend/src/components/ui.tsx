import { CircleX, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

/** Operational errors (network, API). Neutral on purpose: red is reserved for trust & security. */
export function ErrorNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm text-ink ${className}`}
    >
      <CircleX className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Primary = the single lime accent. Use it for the main action of a section only. */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent";

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-raised px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-muted disabled:opacity-50 disabled:hover:border-line-strong";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50";

export const card = "rounded-2xl border border-line bg-surface";

export function Spinner({ className = "size-4", label }: { className?: string; label?: string }) {
  return (
    <LoaderCircle
      className={`${className} shrink-0 animate-spin`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

export function SectionHeader({
  step,
  title,
  id,
  description,
  children,
}: {
  step: string;
  title: string;
  id: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="flex items-baseline gap-2.5 text-base font-semibold tracking-tight">
          <span className="font-mono text-xs font-normal text-muted" aria-hidden="true">
            {step}
          </span>
          {title}
        </h2>
        {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
