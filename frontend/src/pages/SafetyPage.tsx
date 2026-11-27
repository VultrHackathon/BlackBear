import { Route as RouteIcon, ShieldCheck, ShieldExclamationPoint, ShoppingCart, Syringe, Upload, Zap, type LucideIcon } from "lucide-react";
import { Crumbs, PageTitle } from "../components/SiteChrome";
import { EmptyState, Pill } from "../components/ui";
import { formatClock } from "../lib/format";
import { kindLabel, LAYER_DESCRIPTIONS, LAYER_ORDER, layerLabel } from "../lib/labels";
import { useHuntState } from "../state/HuntContext";
import { selectSecurityStats } from "../state/huntReducer";

const KIND_ICONS: Record<string, LucideIcon> = {
  prompt_injection: Syringe,
  redirect: RouteIcon,
  exfiltration: Upload,
  checkout_attempt: ShoppingCart,
};

function Stat({ value, label, tone }: { value: number; label: string; tone?: "safe" | "danger" }) {
  return (
    <div className="rounded-2xl border bg-surface p-4 shadow-card">
      <p className={`text-3xl font-extrabold tracking-[-0.03em] tabular-nums ${tone === "safe" ? "text-safe" : tone === "danger" ? "text-danger" : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

/** How the hunt stayed safe: the security scoreboard, on its own page. */
export function SafetyPage() {
  const state = useHuntState();
  const stats = selectSecurityStats(state);
  const honeypot = state.config?.stores.find((s) => s.honeypot);
  const nameOf = (id: string) => state.config?.stores.find((s) => s.id === id)?.name ?? id;
  const blockedActions = Object.values(state.stores).reduce((n, r) => n + r.actions.filter((a) => !a.allowed).length, 0);

  return (
    <>
      <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Safety" }]} />
      <PageTitle
        sub={`Our red team attacks ${honeypot ? honeypot.name : "our own honeypot shop"} during every hunt. Each attack, and the layer that stopped it, shows up here.`}
      >
        How your hunt stayed safe
      </PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value={state.storeOrder.length} label="sandboxes in this hunt" />
        <Stat value={blockedActions} label="risky actions blocked" />
        <Stat value={stats.blocked} label="attacks stopped" tone={stats.attempted > 0 && stats.blocked === stats.attempted ? "safe" : undefined} />
        <Stat value={stats.succeeded} label="attacks that got through" tone={stats.succeeded > 0 ? "danger" : stats.attempted > 0 ? "safe" : undefined} />
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="layers-heading" className="rounded-2xl border bg-surface p-5 shadow-card">
          <h2 id="layers-heading" className="font-bold">
            Stopped by layer
          </h2>
          <ul className="mt-3 space-y-3">
            {LAYER_ORDER.map((layer) => {
              const n = stats.byLayer[layer] ?? 0;
              return (
                <li key={layer} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{layerLabel(layer)}</span>
                    <span className="block text-xs text-muted">{LAYER_DESCRIPTIONS[layer]}</span>
                  </span>
                  <Pill size="xs" shape="tag" mono tone={n > 0 ? "safe" : "neutral"} className="mt-0.5 tabular-nums" aria-label={`${n} stopped`}>
                    {n}
                  </Pill>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="log-heading" className="rounded-2xl border bg-surface p-5 shadow-card">
          <h2 id="log-heading" className="font-bold">
            Attack log
          </h2>
          {state.security.length === 0 ? (
            <EmptyState compact className="mt-3">
              No attacks yet.{honeypot ? ` They start when ${honeypot.name} is part of the hunt.` : ""}
            </EmptyState>
          ) : (
            <ol className="mt-3 space-y-3" aria-label="Attacks, newest first">
              {state.security.map((e) => {
                const Icon = KIND_ICONS[e.kind] ?? Zap;
                return (
                  <li key={e.key} className="rounded-xl border bg-raised/50 p-3 motion-safe:animate-rise">
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <time className="font-mono tabular-nums" dateTime={new Date(e.at).toISOString()}>
                        {formatClock(e.at)}
                      </time>
                      · <span className="font-medium text-ink">{nameOf(e.store_id)}</span>
                    </p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                      <Icon className="size-4 text-muted" aria-hidden="true" />
                      {kindLabel(e.kind)}
                    </p>
                    <Pill as="p" tone={e.blocked ? "safe" : "danger"} icon={e.blocked ? ShieldCheck : ShieldExclamationPoint} className="mt-1.5">
                      {e.blocked ? `Stopped by ${layerLabel(e.layer)}` : `Got past ${layerLabel(e.layer)}`}
                    </Pill>
                    {e.detail ? <p className="mt-2 font-mono text-2xs leading-relaxed break-words text-muted">{e.detail}</p> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
