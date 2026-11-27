import { formatInt, formatSeconds, formatUsd } from "../lib/format";
import { useNow } from "../lib/useNow";
import { useHuntState } from "../state/HuntContext";
import { isHuntActive } from "../state/huntReducer";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm text-ink tabular-nums">{value}</dd>
    </div>
  );
}

export function MetricsBar() {
  const { metrics, phase, startedAt, finishedAt, elapsedS } = useHuntState();
  const running = isHuntActive(phase) && startedAt != null;
  const now = useNow(running, 250);

  const total =
    elapsedS != null
      ? elapsedS
      : startedAt != null
        ? ((finishedAt ?? (running ? now : startedAt)) - startedAt) / 1000
        : null;

  return (
    <footer className="mt-10 border-t border-line">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <h2 className="sr-only">Hunt metrics</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="LLM calls" value={metrics ? formatInt(metrics.llm_calls) : "–"} />
          <Metric label="Tokens" value={metrics ? formatInt(metrics.tokens) : "–"} />
          <Metric label="Cost estimate" value={metrics ? formatUsd(metrics.cost_usd) : "–"} />
          <Metric label="Sandbox seconds" value={metrics ? formatSeconds(metrics.sandbox_seconds) : "–"} />
          <Metric label="Total time" value={total != null ? formatSeconds(total) : "–"} />
        </dl>
        <p className="mt-5 text-xs text-muted">
          blackbear · Vultr Agent Runtime Hackathon · Stockholm · Black Friday 2026 · Proof, not promises.
        </p>
      </div>
    </footer>
  );
}
