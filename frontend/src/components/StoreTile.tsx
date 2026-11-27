import {
  Camera,
  Check,
  CircleX,
  Clock,
  FlaskConical,
  Globe,
  ImageOff,
  LoaderCircle,
  Lock,
  ScanSearch,
  ScanText,
  ShieldExclamationPoint,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatTimer } from "../lib/format";
import { formatAction, kindLabel, layerLabel } from "../lib/labels";
import { useNow } from "../lib/useNow";
import type { Frame, StoreRun } from "../state/huntReducer";
import type { StoreConfig, StoreStatus } from "../types";

const STATUS_META: Record<
  StoreStatus,
  { label: string; icon: LucideIcon; className: string; spin?: boolean; live?: boolean }
> = {
  queued: { label: "queued", icon: Clock, className: "border-line text-muted" },
  starting: { label: "starting", icon: LoaderCircle, className: "border-line-strong text-ink", spin: true },
  browsing: { label: "browsing", icon: Globe, className: "border-line-strong text-ink", live: true },
  extracting: { label: "extracting", icon: ScanText, className: "border-line-strong text-ink", live: true },
  verifying: { label: "verifying", icon: ScanSearch, className: "border-line-strong text-ink", live: true },
  done: { label: "done", icon: Check, className: "border-ink/50 bg-ink/5 text-ink" },
  blocked: {
    label: "blocked",
    icon: ShieldExclamationPoint,
    className: "border-danger/50 bg-danger/10 text-danger",
  },
  failed: { label: "failed", icon: CircleX, className: "border-line-strong text-muted" },
};

export function StatusPill({ status }: { status: StoreStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] ${meta.className}`}
    >
      {meta.live ? (
        <span className="relative flex size-1.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ink/60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-ink" />
        </span>
      ) : (
        <Icon className={`size-3 ${meta.spin ? "animate-spin" : ""}`} aria-hidden="true" />
      )}
      {meta.label}
    </span>
  );
}

interface Layer {
  key: number;
  src: string;
  loaded: boolean;
}

/** Stacks the previous and the new screenshot; the new one fades in once it has loaded. */
function Screenshot({ frame, alt, rejected }: { frame: Frame | null; alt: string; rejected: number }) {
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    if (!frame) {
      setLayers([]);
      return;
    }
    setLayers((prev) => {
      if (prev.some((l) => l.key === frame.key)) return prev;
      const keep = prev.filter((l) => l.loaded).slice(-1);
      return [...keep, { key: frame.key, src: frame.src, loaded: false }];
    });
  }, [frame]);

  const markLoaded = (key: number) =>
    setLayers((prev) => prev.map((l) => (l.key === key ? { ...l, loaded: true } : l)));
  const drop = (key: number) => setLayers((prev) => prev.filter((l) => l.key !== key));
  // Once the top layer has faded in, the ones underneath can go.
  const settle = (key: number) =>
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.key === key);
      return i > 0 && prev[i]?.loaded ? prev.slice(i) : prev;
    });

  const anyVisible = layers.some((l) => l.loaded);

  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-line bg-canvas">
      {layers.map((l, i) => {
        const isTop = i === layers.length - 1;
        return (
          <img
            key={l.key}
            src={l.src}
            alt={isTop ? alt : ""}
            aria-hidden={isTop ? undefined : true}
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={() => markLoaded(l.key)}
            onError={() => drop(l.key)}
            onTransitionEnd={() => settle(l.key)}
            className={`absolute inset-0 size-full object-cover object-top transition-opacity duration-500 ease-out ${
              l.loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        );
      })}
      {!anyVisible ? (
        <div className="absolute inset-0 grid place-items-center p-2 text-center text-[11px] text-muted">
          {rejected > 0 ? (
            <span className="flex flex-col items-center gap-1">
              <ImageOff className="size-4" aria-hidden="true" />
              Screenshot not loaded: untrusted origin
            </span>
          ) : (
            <span className="flex flex-col items-center gap-1">
              <Camera className="size-4" aria-hidden="true" />
              No screenshot yet
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function StoreTile({
  run,
  store,
  waiting,
}: {
  run: StoreRun;
  store: StoreConfig | undefined;
  waiting: boolean;
}) {
  const name = store?.name ?? run.storeId;
  const domain = store?.domain ?? "unknown domain";
  const active = run.startedAt != null && run.endedAt == null;
  const now = useNow(active, 1000);
  const elapsed = run.startedAt != null ? ((run.endedAt ?? now) - run.startedAt) / 1000 : 0;
  const lastActions = run.actions.slice(-3);
  const lastStep = run.actions.at(-1)?.step;

  const alert = run.alert;
  const alertText = alert
    ? alert.kind && alert.layer
      ? alert.blocked === false
        ? `${kindLabel(alert.kind)} got past the ${layerLabel(alert.layer).toLowerCase()}`
        : `${kindLabel(alert.kind)} stopped by the ${layerLabel(alert.layer).toLowerCase()}`
      : alert.reason
    : null;
  const flagged = run.status === "blocked" || alert !== null;

  return (
    <article
      aria-label={`${name} sandbox, ${STATUS_META[run.status].label}`}
      className={`relative flex min-w-0 flex-col gap-2.5 rounded-xl border bg-canvas/40 p-3 transition-colors duration-300 motion-safe:animate-rise ${
        flagged ? "border-danger/50" : "border-line"
      } ${waiting ? "opacity-75" : ""}`}
    >
      {alert ? (
        <span
          key={alert.seq}
          className="pointer-events-none absolute -inset-px animate-flash rounded-xl bg-danger/10 ring-2 ring-danger"
          aria-hidden="true"
        />
      ) : null}

      <header className="min-w-0 space-y-1.5">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span className="truncate" title={name}>
            {name}
          </span>
          {store?.honeypot ? (
            <FlaskConical className="size-3.5 shrink-0 text-muted" aria-label="Honeypot" role="img" />
          ) : null}
        </h3>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusPill status={run.status} />
          <p
            className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted"
            title={`This sandbox can only reach ${domain}`}
          >
            <Lock className="size-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">Locked to</span>
            <span className="truncate">{domain}</span>
          </p>
        </div>
      </header>

      <Screenshot frame={run.frame} alt={`Latest screenshot from the ${name} sandbox`} rejected={run.rejectedScreenshots} />

      {alertText ? (
        <div
          className="flex gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger"
          title={alert?.reason}
        >
          <ShieldExclamationPoint className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <p className="line-clamp-3 min-w-0 break-words">
            <span className="sr-only">Blocked: </span>
            {alertText}
          </p>
        </div>
      ) : run.message ? (
        <p className="line-clamp-2 text-xs text-muted" title={run.message}>
          {run.message}
        </p>
      ) : null}

      <ol className="min-h-[3.75rem] space-y-0.5 font-mono text-[11px] leading-[1.35rem]" aria-label={`Last actions in ${name}`}>
        {lastActions.length === 0 ? (
          <li className="text-muted">{waiting ? "waiting for approval" : run.status === "queued" ? "queued" : "no actions yet"}</li>
        ) : (
          lastActions.map((a) => {
            const text = formatAction(a.action);
            return (
              <li
                key={a.key}
                className={`flex min-w-0 gap-1.5 motion-safe:animate-fade-in ${a.allowed ? "text-ink/90" : "text-danger"}`}
                title={a.allowed ? text : `${text}: blocked${a.reason ? ` (${a.reason})` : ""}`}
              >
                <span className="shrink-0 text-muted tabular-nums">{String(a.step).padStart(2, "0")}</span>
                {a.allowed ? null : (
                  <span className="shrink-0" aria-hidden="true">
                    ✕
                  </span>
                )}
                {a.allowed ? null : <span className="sr-only">Blocked:</span>}
                <span className="truncate">{text}</span>
              </li>
            );
          })
        )}
      </ol>

      <footer className="mt-auto flex items-center justify-between font-mono text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Timer className="size-3" aria-hidden="true" />
          <span className="sr-only">Elapsed</span>
          <span className="tabular-nums">{formatTimer(elapsed)}</span>
        </span>
        {lastStep != null ? <span className="tabular-nums">step {lastStep}</span> : null}
      </footer>
    </article>
  );
}
