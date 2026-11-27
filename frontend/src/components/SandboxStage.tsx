import { Check, ChevronDown, ChevronRight, FlaskConical, ShieldCheck, ShieldExclamationPoint } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { formatAction } from "../lib/labels";
import { useHuntState } from "../state/HuntContext";
import { selectSecurityStats, selectStatusCounts, type StoreRun } from "../state/huntReducer";
import type { StoreConfig } from "../types";
import { describeAlert, Elapsed, STATUS_META, StatusLabel } from "./Monitor";
import { SandboxFocus } from "./SandboxFocus";
import { StoreMark } from "./StoreMark";
import { Button, Led, Pill, Skeleton } from "./ui";

const STAGES = ["Plan", "Visit stores", "Read carts", "Done"] as const;

/** One store's sandbox as a single line: who, what it is doing now, status and time. */
const StoreRow = memo(function StoreRow({
  run,
  store,
  waiting,
  onOpen,
}: {
  run: StoreRun;
  store: StoreConfig | undefined;
  waiting: boolean;
  onOpen: (storeId: string) => void;
}) {
  const name = store?.name ?? run.storeId;
  const meta = STATUS_META[run.status];
  const last = run.actions.at(-1);
  const alert = describeAlert(run.alert);
  const now = alert
    ? alert
    : last
      ? `${last.allowed ? "" : "✕ "}${formatAction(last.action)}`
      : waiting
        ? "waiting for your go"
        : (run.message ?? meta.label);
  const flagged = run.status === "blocked" || run.alert !== null;
  return (
    <li>
      <button
        type="button"
        data-sandbox-open={run.storeId}
        onClick={() => onOpen(run.storeId)}
        aria-haspopup="dialog"
        aria-label={`${name}: ${meta.label}. Open sandbox details`}
        className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 text-left transition duration-200 ease-glide hover:-translate-y-px hover:shadow-key ${
          flagged ? "border-danger/40" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <Led state={waiting ? "off" : meta.led} />
          <StoreMark id={run.storeId} name={name} size="sm" decorative />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{name}</span>
            {store?.honeypot ? <FlaskConical className="size-3.5 shrink-0 text-muted" aria-label="Honeypot" role="img" /> : null}
          </span>
          <span className={`block truncate font-mono text-2xs ${flagged ? "text-danger" : "text-muted"}`}>{now}</span>
        </span>
        <span className="flex items-center gap-2 font-mono text-2xs text-muted">
          <StatusLabel status={run.status} />
          <span className="hidden tabular-nums sm:inline">
            <Elapsed startedAt={run.startedAt} endedAt={run.endedAt} />
          </span>
          <ChevronRight className="size-3.5 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
});

/**
 * The live hunt, kept calm: stage, overall progress, and one line per store. It
 * folds once the hunt is done so the products move up. Any line opens that store's
 * sandbox view; proof of a price lives with the product (its cart screenshot).
 */
export function SandboxStage() {
  const state = useHuntState();
  const { storeOrder, stores, config, phase, startedAt } = state;
  const storeById = new Map(config?.stores.map((s) => [s.id, s]) ?? []);
  const waiting = phase === "awaiting_approval";
  const listRef = useRef<HTMLUListElement>(null);
  const security = selectSecurityStats(state);
  const counts = selectStatusCounts(state);
  const total = storeOrder.length;
  const finished = counts.done + counts.blocked + counts.failed;

  // Open while agents work, folded once the hunt is done, unless the shopper chose.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  useEffect(() => setManualOpen(null), [startedAt]);
  const open = manualOpen ?? phase !== "done";

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const openId = focusedId !== null && stores[focusedId] ? focusedId : null;
  useEffect(() => {
    if (focusedId !== null && openId === null) setFocusedId(null);
  }, [focusedId, openId]);

  const closeFocus = () => {
    const last = focusedId;
    setFocusedId(null);
    if (last !== null) listRef.current?.querySelector<HTMLButtonElement>(`[data-sandbox-open="${CSS.escape(last)}"]`)?.focus();
  };

  const planning = phase === "creating" || phase === "planning";
  const live = phase === "running" || planning;
  const stage = phase === "done" ? 3 : phase === "running" ? (counts.verifying > 0 || finished > 0 ? 2 : 1) : 0;
  const pct = phase === "done" ? 100 : phase === "running" && total ? Math.round(8 + (finished / total) * 88) : 4;
  const progress =
    total === 0
      ? planning
        ? "Planning which stores to search…"
        : "Your sandboxes appear here."
      : waiting
        ? `${total} sandboxes ready`
        : finished === total
          ? `${total} sandboxes finished`
          : `${finished} of ${total} finished`;

  return (
    <section aria-labelledby="stage-heading" className="rounded-[1.5rem] border bg-well p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] uppercase">
            <span className="relative flex size-2" aria-hidden="true">
              {live ? <span className="absolute inset-0 rounded-full bg-accent motion-safe:animate-ping" /> : null}
              <span className={`relative size-2 rounded-full ${phase === "done" ? "bg-safe" : "bg-accent"}`} />
            </span>
            {live ? "Live" : phase === "done" ? "Finished" : "Ready"}
          </p>
          <h2 id="stage-heading" className="mt-1 text-lg font-bold tracking-tight">
            Live sandboxes
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {security.attempted > 0 ? (
            security.blocked === security.attempted ? (
              <Pill tone="safe" icon={ShieldCheck}>
                {security.blocked} {security.blocked === 1 ? "attack" : "attacks"} blocked
              </Pill>
            ) : (
              <Pill tone="danger" icon={ShieldExclamationPoint}>
                {security.attempted - security.blocked} got through
              </Pill>
            )
          ) : null}
          {total > 0 ? (
            <Button variant="ghost" size="sm" aria-expanded={open} aria-controls="stage-body" onClick={() => setManualOpen(!open)}>
              {open ? "Hide stores" : "Show stores"}
              <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Hunt stages">
        {STAGES.map((label, i) => (
          <li
            key={label}
            aria-current={i === stage ? "step" : undefined}
            className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs ${
              i < stage ? "bg-safe/12 text-safe" : i === stage ? "bg-ink font-semibold text-white" : "bg-surface text-muted"
            }`}
          >
            {i < stage ? <Check className="size-3" aria-hidden="true" /> : null}
            {label}
          </li>
        ))}
      </ol>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-label="Hunt progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-glide ${phase === "done" ? "bg-safe" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p aria-live="polite" className="font-mono text-xs text-muted">
          {progress}
        </p>
        <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
          {storeOrder.map((id) => {
            const run = stores[id];
            return run ? <Led key={id} state={waiting ? "off" : STATUS_META[run.status].led} /> : null;
          })}
        </div>
      </div>

      {total === 0 && planning ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border bg-surface px-3 py-3">
              <span className="size-7 animate-pulse rounded-lg bg-raised" />
              <span className="flex-1 space-y-2">
                <Skeleton width="40%" />
                <Skeleton width="70%" />
              </span>
            </div>
          ))}
        </div>
      ) : open && total > 0 ? (
        <ul id="stage-body" ref={listRef} className="mt-4 grid gap-2 xl:grid-cols-2" aria-label="Sandboxes">
          {storeOrder.map((id) => {
            const run = stores[id];
            return run ? <StoreRow key={id} run={run} store={storeById.get(id)} waiting={waiting} onOpen={setFocusedId} /> : null;
          })}
        </ul>
      ) : null}

      {openId !== null ? <SandboxFocus storeId={openId} onNavigate={setFocusedId} onClose={closeFocus} /> : null}
    </section>
  );
}
