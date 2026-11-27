import { Boxes, Radio } from "lucide-react";
import { USE_MOCK } from "../lib/env";
import { useHuntState } from "../state/HuntContext";
import { selectStatusCounts, type HuntState } from "../state/huntReducer";
import { card, SectionHeader } from "./ui";
import { StoreTile } from "./StoreTile";

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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted">
      {live ? (
        <span className="relative flex size-1.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ink/60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-ink" />
        </span>
      ) : (
        <Radio className="size-3" aria-hidden="true" />
      )}
      {label}
    </span>
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
  const { storeOrder, stores, config, phase, connection } = state;
  const storeById = new Map(config?.stores.map((s) => [s.id, s]) ?? []);
  const waiting = phase === "awaiting_approval";

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

      <p aria-live="polite" className="mt-3 font-mono text-xs text-muted">
        {summarize(state)}
      </p>

      {storeOrder.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          <Boxes className="size-5" aria-hidden="true" />
          Sandboxes appear here once the planner has a plan.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {storeOrder.map((id) => {
            const run = stores[id];
            return run ? <StoreTile key={id} run={run} store={storeById.get(id)} waiting={waiting} /> : null;
          })}
        </div>
      )}
    </section>
  );
}
