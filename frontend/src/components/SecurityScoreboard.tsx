import {
  Route,
  ShieldCheck,
  ShieldExclamationPoint,
  ShoppingCart,
  Syringe,
  Upload,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { formatClock, formatPercent } from "../lib/format";
import { kindLabel, LAYER_DESCRIPTIONS, LAYER_ORDER, layerLabel } from "../lib/labels";
import { useHuntState } from "../state/HuntContext";
import { selectSecurityStats } from "../state/huntReducer";
import { card, EmptyState, Pill, well } from "./ui";

const KIND_ICONS: Record<string, LucideIcon> = {
  prompt_injection: Syringe,
  redirect: Route,
  exfiltration: Upload,
  checkout_attempt: ShoppingCart,
};

function Counter({ label, value, tone }: { label: string; value: string; tone?: "safe" | "danger" }) {
  return (
    <div className={`${well} min-w-0 px-3 py-2.5`}>
      <dt className="text-2xs leading-tight text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
          tone === "safe" ? "text-safe" : tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function SecurityScoreboard() {
  const state = useHuntState();
  const { security, config } = state;
  const stats = selectSecurityStats(state);
  const storeName = (id: string) => config?.stores.find((s) => s.id === id)?.name ?? id;
  const honeypot = config?.stores.find((s) => s.honeypot);

  const rate = stats.successRate;
  const rateTone = rate == null ? undefined : rate === 0 ? "safe" : "danger";

  return (
    <section aria-labelledby="security-heading" className={`${card} p-4`}>
      <h2 id="security-heading" className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <ShieldCheck className="size-4 text-muted" aria-hidden="true" />
        Security scoreboard
      </h2>
      <p className="mt-1 text-sm text-muted">
        Our red team attacks {honeypot ? honeypot.name : "our own honeypot shop"} during the hunt. Every attack and the
        layer that stopped it shows up here.
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Counter label="Attacks attempted" value={String(stats.attempted)} />
        <Counter
          label="Blocked"
          value={String(stats.blocked)}
          tone={stats.attempted > 0 && stats.blocked === stats.attempted ? "safe" : undefined}
        />
        <Counter label="Attack success rate" value={rate == null ? "–" : formatPercent(rate)} tone={rateTone} />
      </dl>

      <h3 className="mt-5 text-sm font-medium">Stopped by layer</h3>
      <ul className="mt-2 space-y-1.5">
        {LAYER_ORDER.map((layer) => {
          const n = stats.byLayer[layer] ?? 0;
          return (
            <li key={layer} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block">{layerLabel(layer)}</span>
                <span className="block text-xs text-muted">{LAYER_DESCRIPTIONS[layer]}</span>
              </span>
              <Pill
                size="xs"
                shape="tag"
                mono
                tone={n > 0 ? "safe" : "neutral"}
                className="mt-0.5 tabular-nums"
                aria-label={`${n} stopped`}
              >
                {n}
              </Pill>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-5 text-sm font-medium">Live attack log</h3>
      {security.length === 0 ? (
        <EmptyState compact className="mt-2">
          No attacks yet.
          {honeypot ? ` They start when ${honeypot.name} is part of the hunt.` : ""}
        </EmptyState>
      ) : null}
      <ol className="mt-2 space-y-2" aria-live="polite" aria-relevant="additions" aria-label="Attack log, newest first">
        {security.map((e) => {
          const Icon = KIND_ICONS[e.kind] ?? Zap;
          return (
            <li key={e.key} className={`${well} p-3 motion-safe:animate-rise`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <time className="font-mono text-muted tabular-nums" dateTime={new Date(e.at).toISOString()}>
                  {formatClock(e.at)}
                </time>
                <span className="text-muted" aria-hidden="true">
                  ·
                </span>
                <span className="font-medium">{storeName(e.store_id)}</span>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                {kindLabel(e.kind)}
              </p>
              <Pill
                as="p"
                tone={e.blocked ? "safe" : "danger"}
                icon={e.blocked ? ShieldCheck : ShieldExclamationPoint}
                className="mt-1.5"
              >
                {e.blocked ? `Stopped by ${layerLabel(e.layer)}` : `Got past ${layerLabel(e.layer)}`}
              </Pill>
              {e.detail ? (
                <p className="mt-2 font-mono text-2xs leading-relaxed break-words text-muted">{e.detail}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
