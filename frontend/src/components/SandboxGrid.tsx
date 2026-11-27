import { Boxes, Radio } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { USE_MOCK } from "../lib/env";
import { useHuntState } from "../state/HuntContext";
import { selectStatusCounts, type HuntState } from "../state/huntReducer";
import { STATUS_META } from "./Monitor";
import { SandboxFocus } from "./SandboxFocus";
import { StoreTile } from "./StoreTile";
import { card, EmptyState, Led, Pill, SectionHeader } from "./ui";

function ConnectionPill({ connection }: { connection: HuntState["connection"] }) {
  if (connection === "idle") return null;
  const label = USE_MOCK
    ? connection === "closed"
      ? "Replay finished"
      : "Mock stream"
    : {
        connecting: "Connecting…",
        open: "Live",
        reconnecting: "Reconnecting…",
        closed: "Stream closed",
      }[connection];
  const live = connection === "open";
  return (
    <Pill mono>
      {live ? <Led state="live" /> : <Radio className="size-3 shrink-0" aria-hidden="true" />}
      {label}
    </Pill>
  );
}

function summarize(state: HuntState): string {
  const total = state.storeOrder.length;
  if (total === 0) {
    return state.phase === "planning" || state.phase === "creating"
      ? "Waiting for the planner…"
      : "No sandboxes running.";
  }
  const c = selectStatusCounts(state);
  if (state.phase === "awaiting_approval") return `${total} sandboxes queued, waiting for your approval.`;
  const working = c.starting + c.browsing + c.extracting + c.verifying;
  const parts = [
    working ? `${working} working` : null,
    c.queued ? `${c.queued} queued` : null,
    c.done ? `${c.done} done` : null,
    c.blocked ? `${c.blocked} blocked` : null,
    c.failed ? `${c.failed} failed` : null,
  ].filter(Boolean);
  return `${total} sandboxes: ${parts.join(", ")}.`;
}

export function SandboxGrid() {
  const state = useHuntState();
  const { storeOrder, stores, config, phase, connection, offers } = state;
  const storeById = new Map(config?.stores.map((s) => [s.id, s]) ?? []);
  const waiting = phase === "awaiting_approval";
  const gridRef = useRef<HTMLDivElement>(null);

  // Stores that produced an offer: `done` on its own also covers "no match".
  const capturedStores = useMemo(() => new Set(Object.values(offers).map((o) => o.store_id)), [offers]);

  // The sandbox shown in the larger view. It closes by itself if that sandbox goes away (a new hunt).
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const openId = focusedId !== null && stores[focusedId] ? focusedId : null;
  useEffect(() => {
    if (focusedId !== null && openId === null) setFocusedId(null);
  }, [focusedId, openId]);

  const closeFocus = () => {
    const last = focusedId;
    setFocusedId(null);
    // Back to the tile that was showing last, which may not be the one that opened the view.
    if (last !== null) {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-sandbox-open="${CSS.escape(last)}"]`)?.focus();
    }
  };

  return (
    <section aria-labelledby="grid-heading" className={`${card} p-4 sm:p-5`}>
      <SectionHeader
        step="03"
        id="grid-heading"
        title="Live sandboxes"
        description="Each browser agent runs in its own Vultr sandbox and can only reach its own store."
      >
        <ConnectionPill connection={connection} />
      </SectionHeader>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p aria-live="polite" className="font-mono text-xs text-muted">
          {summarize(state)}
        </p>
        {/* One light per sandbox, in tile order. Decorative: the sentence beside it says the same. */}
        {storeOrder.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
            {storeOrder.map((id) => {
              const run = stores[id];
              return run ? <Led key={id} state={waiting ? "off" : STATUS_META[run.status].led} /> : null;
            })}
          </div>
        ) : null}
      </div>

      {storeOrder.length === 0 ? (
        <EmptyState icon={Boxes} className="mt-3">
          Sandboxes appear here once the planner has a plan.
        </EmptyState>
      ) : (
        <div ref={gridRef} className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
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
      )}

      {openId !== null ? <SandboxFocus storeId={openId} onNavigate={setFocusedId} onClose={closeFocus} /> : null}
    </section>
  );
}
