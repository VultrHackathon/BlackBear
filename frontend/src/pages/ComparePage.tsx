import { RotateCw, Scale, ShoppingCart, Sparkles, Trophy, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../api/client";
import { TrustPill } from "../components/ProductCard";
import { ProductPhoto } from "../components/ProductPhoto";
import { SafeMarkdown } from "../components/SafeMarkdown";
import { Crumbs, PageTitle } from "../components/SiteChrome";
import { StoreMark } from "../components/StoreMark";
import { Button, EmptyState, ErrorNote, Skeleton } from "../components/ui";
import { itemsTotal, rankMap, shippingKnown } from "../lib/deals";
import { formatSek } from "../lib/format";
import { href } from "../lib/router";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import { isHuntActive } from "../state/huntReducer";
import { useShop } from "../state/ShopContext";
import type { CompareResponse, Offer } from "../types";

type Explain = { status: "loading" } | { status: "ready"; data: CompareResponse } | { status: "error"; message: string };

/**
 * Two offers side by side. The numbers come from the offers; the "why" comes from the
 * compare agent (POST /api/compare), whose numbers the backend checks against code.
 */
export function ComparePage() {
  const state = useHuntState();
  const { toggleCompare, clearCompare } = useHuntActions();
  const { addToCart } = useShop();
  const offers = state.compare.map((id) => state.offers[id]).filter((o): o is Offer => !!o);
  const [a, b] = offers;
  const [explain, setExplain] = useState<Explain>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const idA = a?.id;
  const idB = b?.id;

  useEffect(() => {
    if (!idA || !idB) return;
    const ctrl = new AbortController();
    setExplain({ status: "loading" });
    api
      .compare(idA, idB, ctrl.signal)
      .then((data) => setExplain({ status: "ready", data }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setExplain({ status: "error", message: errorMessage(err) });
      });
    return () => ctrl.abort();
  }, [idA, idB, attempt]);

  const crumbs = <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Results", to: { name: "results" } }, { label: "Compare" }]} />;
  if (!a || !b) {
    return (
      <>
        {crumbs}
        <PageTitle>Compare</PageTitle>
        <EmptyState icon={Scale}>
          {offers.length === 1 ? "Pick one more offer to compare." : "Pick two offers with “Compare” on the results page."}
        </EmptyState>
        <div className="mt-4 flex justify-center">
          <a href={href({ name: "results" })} className="text-sm font-semibold underline underline-offset-2">
            Back to results
          </a>
        </div>
      </>
    );
  }

  const ranks = rankMap(state.ranking);
  const running = isHuntActive(state.phase);
  const nameOf = (o: Offer) => state.config?.stores.find((s) => s.id === o.store_id)?.name ?? o.store_id;
  // Only a ranked offer can win. The compare agent's own pick wins when it has one.
  const data = explain.status === "ready" ? explain.data : null;
  const winnerId =
    data?.winner_id ||
    [a, b]
      .filter((o) => ranks.has(o.id))
      .sort((x, y) => (ranks.get(x.id) ?? 0) - (ranks.get(y.id) ?? 0))[0]?.id ||
    null;
  const pair = [a, b];
  const cell = (o: Offer) => (o.id === winnerId ? "bg-accent/12" : "");
  const rows: { label: string; render: (o: Offer) => ReactNode }[] = [
    { label: "Unit price", render: (o) => formatSek(o.price_sek) },
    {
      label: "Promo",
      render: (o) => o.promos.find((p) => p.applied_in_cart === true && p.type !== "free_shipping_over")?.text ?? "–",
    },
    { label: `Items × ${a.quantity}`, render: (o) => formatSek(itemsTotal(o)) },
    {
      label: "Delivery",
      render: (o) => (!shippingKnown(o) ? "not shown" : o.shipping_sek === 0 ? "Free" : formatSek(o.shipping_sek)),
    },
    {
      label: "You pay",
      render: (o) => (
        <b className="text-xl font-extrabold tabular-nums">{shippingKnown(o) ? formatSek(o.effective_total_sek) : "unknown"}</b>
      ),
    },
    { label: "Trust", render: (o) => <TrustPill offer={o} auditing={running} /> },
  ];

  return (
    <>
      {crumbs}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>Compare offers</PageTitle>
        <Button variant="ghost" size="sm" icon={X} onClick={clearCompare}>
          Clear
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-surface shadow-card">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            {nameOf(a)} compared with {nameOf(b)}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-40 px-4 py-4">
                <span className="sr-only">Attribute</span>
              </th>
              {pair.map((o) => (
                <th key={o.id} scope="col" className={`px-4 py-4 align-top font-normal ${cell(o)}`}>
                  <a href={href({ name: "offer", id: o.id })} className="group block">
                    <ProductPhoto src={o.image_url} alt="" storeId={o.store_id} storeName={nameOf(o)} className="aspect-[4/3] max-w-56" />
                    <span className="mt-3 flex items-center gap-2 text-xs text-muted">
                      <StoreMark id={o.store_id} name={nameOf(o)} size="xs" decorative />
                      {nameOf(o)}
                    </span>
                    <span className="mt-1 line-clamp-2 block font-semibold group-hover:underline">{o.title}</span>
                  </a>
                  {o.id === winnerId ? (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">
                      <Trophy className="size-3.5" aria-hidden="true" />
                      Best for you
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="px-4 py-3 text-xs font-medium text-muted">
                  {r.label}
                </th>
                {pair.map((o) => (
                  <td key={o.id} className={`px-4 py-3 tabular-nums ${cell(o)}`}>
                    {r.render(o)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
              {pair.map((o) => (
                <td key={o.id} className={`px-4 py-3 ${cell(o)}`}>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" icon={ShoppingCart} onClick={() => addToCart(o, state.config?.stores.find((s) => s.id === o.store_id))}>
                      Add to cart
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleCompare(o.id)}>
                      Remove
                    </Button>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <section aria-labelledby="why-heading" className="mt-6 rounded-2xl border bg-surface p-5 shadow-card" aria-live="polite">
        <h2 id="why-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-muted" aria-hidden="true" />
          Why
        </h2>
        <div className="mt-3">
          {explain.status === "loading" ? (
            <div className="space-y-2" aria-hidden="true">
              {[88, 72, 80].map((w) => (
                <Skeleton key={w} width={`${w}%`} />
              ))}
            </div>
          ) : explain.status === "error" ? (
            <div className="flex flex-wrap items-center gap-3">
              <ErrorNote>Couldn't explain: {explain.message}</ErrorNote>
              <Button size="sm" icon={RotateCw} onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </Button>
            </div>
          ) : (
            <SafeMarkdown className="text-sm">{explain.data.explanation_md}</SafeMarkdown>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">Every number is computed by code; the agent only writes the explanation.</p>
      </section>
    </>
  );
}
