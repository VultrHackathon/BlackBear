import { Check, Hand, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatAction } from "../lib/labels";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import type { GateEntry } from "../state/huntReducer";
import { Button, Pill } from "./ui";

/** Seconds left before the backend denies an unanswered gate (fail-safe). */
function useCountdown(gate: GateEntry): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (gate.status !== "pending" && gate.status !== "sending") return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [gate.status]);
  return Math.max(0, Math.ceil(gate.timeoutS - (now - gate.requestedAt) / 1000));
}

function GateCard({ gate }: { gate: GateEntry }) {
  const { config } = useHuntState();
  const { resolveGate } = useHuntActions();
  const [error, setError] = useState<string | null>(null);
  const left = useCountdown(gate);
  const store = config?.stores.find((s) => s.id === gate.storeId)?.name ?? gate.storeId;
  const busy = gate.status === "sending";
  const decide = async (approve: boolean) => setError(await resolveGate(gate.id, approve));

  return (
    <section
      role="alertdialog"
      aria-labelledby={`gate-${gate.id}`}
      className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-caution/50 bg-surface p-4 shadow-card"
    >
      <div className="flex items-center gap-2">
        <Hand className="size-4 text-caution" aria-hidden="true" />
        <h2 id={`gate-${gate.id}`} className="text-sm font-semibold">
          Approve before submit · {store}
        </h2>
        <Pill size="xs" tone="caution" mono className="ml-auto tabular-nums">
          {left}s
        </Pill>
      </div>
      <p className="mt-2 text-sm text-muted">
        The agent paused before an irreversible step. Nothing happens unless you approve. With no answer, it is denied.
      </p>
      <p className="mt-2 rounded-lg border border-line bg-canvas/50 px-3 py-2 font-mono text-xs break-words">
        step {String(gate.step).padStart(2, "0")} · {formatAction(gate.action)}
      </p>
      <p className="mt-1 text-xs text-muted break-words">{gate.reason}</p>
      {gate.screenshot ? (
        <img src={gate.screenshot} alt={`What the ${store} agent sees`} className="mt-3 max-h-48 w-full rounded-lg border border-line object-cover object-top" />
      ) : null}
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Approving lets the agent open the checkout to read it. Placing the order, payment and login stay blocked.
      </p>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" icon={X} onClick={() => decide(false)} disabled={busy} className="flex-1">
          Deny
        </Button>
        <Button icon={Check} onClick={() => decide(true)} disabled={busy} className="flex-1">
          Approve
        </Button>
      </div>
    </section>
  );
}

/** Pending approve-before-submit gates, stacked in the corner of the screen. */
export function ApprovalGate() {
  const { gates } = useHuntState();
  const pending = gates.filter((g) => g.status === "pending" || g.status === "sending");
  if (pending.length === 0) return null;
  return (
    <div className="fixed right-4 bottom-24 z-50 flex flex-col gap-3" aria-live="assertive">
      {pending.map((g) => (
        <GateCard key={g.id} gate={g} />
      ))}
    </div>
  );
}
