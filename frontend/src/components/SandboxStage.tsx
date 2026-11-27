import { Camera, ChevronDown, ShieldCheck, ShieldExclamationPoint } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHuntState } from "../state/HuntContext";
import { selectSecurityStats, selectStatusCounts } from "../state/huntReducer";
import { STATUS_META } from "./Monitor";
import { SandboxFocus } from "./SandboxFocus";
import { StoreTile } from "./StoreTile";
import { Button, Led, Pill } from "./ui";

/**
 * Step 2: the live sandboxes, on a dark stage. While agents work it shows every
 * monitor; once the hunt is done it folds into a strip of small screens so the
 * products move up. Any screen opens the larger view.
 */
export function SandboxStage() {
  const state = useHuntState();
  const { storeOrder, stores, config, phase, offers, startedAt } = state;
  const storeById = new Map(config?.stores.map((s) => [s.id, s]) ?? []);
  const waiting = phase === "awaiting_approval";
  const gridRef = useRef<HTMLDivElement>(null);
  const security = selectSecurityStats(state);
  const counts = selectStatusCounts(state);
  const total = storeOrder.length;
  const finished = counts.done + counts.blocked + counts.failed;

  const capturedStores = useMemo(() => new Set(Object.values(offers).map((o) => o.store_id)), [offers]);

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
    if (last !== null) {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-sandbox-open="${CSS.escape(last)}"]`)?.focus();
    }
  };

  if (total === 0) {
    // Nothing to show yet: an empty stage, so the page doesn't jump when monitors arrive.
    const planning = phase === "creating" || phase === "planning";
    return (
      <section
        aria-label="Live sandboxes"
        className="theme-dark relative isolate overflow-hidden rounded-[1.75rem] bg-canvas p-4 shadow-lift sm:p-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-80 bg-[radial-gradient(closest-side,rgb(255_194_26/0.12),transparent)]"
          aria-hidden="true"
        />
        <p className="flex items-center gap-2 text-xs font-medium text-muted">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          Step 2
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Live sandboxes</p>
        <p className="mt-3 font-mono text-xs text-muted" aria-live="polite">
          {planning ? "Planning which stores to search…" : "Your sandboxes appear here."}
        </p>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-line-strong/50 bg-raised/60 p-3">
              <div className="h-3 w-1/2 rounded-full bg-line" />
              <div
                className={`mt-3 aspect-[16/10] rounded-[0.65rem] bg-well inset-shadow-well ${planning ? "motion-safe:animate-pulse" : ""}`}
              />
              <div className="mt-3 h-2 w-full rounded-full bg-line/70" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const progress = waiting
    ? `${total} sandboxes ready`
    : finished === total
      ? `${total} sandboxes finished`
      : `${finished} of ${total} finished`;

  return (
    <section
      aria-labelledby="stage-heading"
      className="theme-dark relative isolate overflow-hidden rounded-[1.75rem] bg-canvas p-4 shadow-lift sm:p-6"
    >
      {/* A soft light from above the stage. */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-80 bg-[radial-gradient(closest-side,rgb(255_194_26/0.16),transparent)]"
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-muted">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            Step 2
          </p>
          <h2 id="stage-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
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
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls="stage-body"
            onClick={() => setManualOpen(!open)}
          >
            {open ? "Fold" : "Show all"}
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
        </div>
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

      <div id="stage-body" ref={gridRef} className="mt-4">
        {open ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
            {storeOrder.map((id) => {
              const run = stores[id];
              return run ? (
                <StoreTile
                  key={id}
                  run={run}
                  store={storeById.get(id)}
                  waiting={waiting}
                  captured={capturedStores.has(id)}
                  onOpen={setFocusedId}
                />
              ) : null;
            })}
          </div>
        ) : (
          // Folded: one small screen per sandbox.
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3" aria-label="Sandboxes">
            {storeOrder.map((id) => {
              const run = stores[id];
              if (!run) return null;
              const name = storeById.get(id)?.name ?? id;
              const meta = STATUS_META[run.status];
              return (
                <li key={id} className="min-w-0">
                  <button
                    type="button"
                    data-sandbox-open={id}
                    onClick={() => setFocusedId(id)}
                    aria-haspopup="dialog"
                    aria-label={`Open ${name} sandbox details, ${meta.label}`}
                    className="group block w-full rounded-xl text-left"
                  >
                    <span
                      className={`block rounded-[0.6rem] p-[2px] transition duration-200 ease-glide group-hover:-translate-y-0.5 ${
                        run.status === "blocked" ? "bg-danger/80 shadow-alarm" : "bg-linear-to-b from-line-strong to-line"
                      }`}
                    >
                      <span className="glass-sheen relative block aspect-[16/10] overflow-hidden rounded-[0.45rem] bg-well">
                        {run.frame ? (
                          <img
                            src={run.frame.src}
                            alt=""
                            draggable={false}
                            referrerPolicy="no-referrer"
                            className={`size-full object-cover object-top ${run.status === "failed" ? "grayscale" : ""}`}
                          />
                        ) : (
                          <Camera className="absolute inset-0 m-auto size-4 text-muted" aria-hidden="true" />
                        )}
                      </span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <Led state={meta.led} />
                      <span className="truncate">{name}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openId !== null ? <SandboxFocus storeId={openId} onNavigate={setFocusedId} onClose={closeFocus} /> : null}
    </section>
  );
}
