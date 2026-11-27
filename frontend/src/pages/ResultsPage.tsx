import { MessagesSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { CartProof } from "../components/CartProof";
import { ProductCard } from "../components/ProductCard";
import { SandboxStage } from "../components/SandboxStage";
import { Crumbs, PageTitle } from "../components/SiteChrome";
import { EmptyState, Skeleton } from "../components/ui";
import { orderRanked, rankMap, shippingKnown } from "../lib/deals";
import { formatTimer } from "../lib/format";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import { isHuntActive, selectRankedOffers, selectStatusCounts } from "../state/huntReducer";
import { useShop } from "../state/ShopContext";
import type { Offer } from "../types";

type Sort = "best" | "unit" | "trust";
const TRUST_ORDER = { real: 0, questionable: 1, unknown: 2, fake: 3 } as const;

function FilterChip({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`h-8 rounded-full border px-3 text-xs font-medium transition duration-150 ease-press active:translate-y-px ${
        on ? "border-ink bg-ink text-white" : "bg-surface text-ink hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The listing page from the team's mockup: the live sandboxes on top, then the products.
 * Ranked offers first; offers waiting on shipping and excluded ones are listed apart.
 */
export function ResultsPage() {
  const state = useHuntState();
  const { toggleCompare } = useHuntActions();
  const { includeDelivery, setIncludeDelivery } = useShop();
  const [sort, setSort] = useState<Sort>("best");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [shippingOnly, setShippingOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const [proofId, setProofId] = useState<string | null>(null);
  const proofOffer = proofId ? state.offers[proofId] : undefined;
  const closeProof = () => {
    const last = proofId;
    setProofId(null);
    if (last) document.querySelector<HTMLButtonElement>(`[data-proof-open="${CSS.escape(last)}"]`)?.focus();
  };

  const storeById = useMemo(() => new Map(state.config?.stores.map((s) => [s.id, s]) ?? []), [state.config]);
  const { offers: all, provisional } = selectRankedOffers(state);
  const ranks = rankMap(state.ranking);
  const running = isHuntActive(state.phase);
  const counts = selectStatusCounts(state);
  const pending = running ? counts.queued + counts.starting + counts.browsing + counts.extracting + counts.verifying : 0;

  const keep = (o: Offer) =>
    (!verifiedOnly || o.trust?.label === "real") && (!shippingOnly || shippingKnown(o)) && (!inStockOnly || o.in_stock);
  const sortWith = (list: Offer[]) => {
    if (sort === "unit") return [...list].sort((a, b) => a.effective_unit_sek - b.effective_unit_sek);
    if (sort === "trust")
      return [...list].sort(
        (a, b) =>
          TRUST_ORDER[a.trust?.label ?? "unknown"] - TRUST_ORDER[b.trust?.label ?? "unknown"] ||
          a.effective_total_sek - b.effective_total_sek,
      );
    return list;
  };

  // Before the ranking arrives every offer is provisional; after it, three groups.
  const ranked = provisional ? [] : orderRanked(all.filter((o) => ranks.has(o.id)), includeDelivery);
  const isOther = (o: Offer) => o.match === "other" && o.trust?.label !== "fake";
  const waiting = provisional
    ? []
    : all.filter((o) => !ranks.has(o.id) && !isOther(o) && !shippingKnown(o) && o.trust?.label !== "fake");
  const others = provisional ? [] : all.filter((o) => !ranks.has(o.id) && isOther(o));
  const excluded = provisional ? [] : all.filter((o) => !ranks.has(o.id) && !waiting.includes(o) && !others.includes(o));
  const othersShown = sortWith(others.filter(keep));
  const main = sortWith((provisional ? all : ranked).filter(keep));
  const waitingShown = shippingOnly ? [] : sortWith(waiting.filter(keep));
  const excludedShown = showExcluded ? sortWith(excluded.filter(keep)) : [];
  const bestId = !provisional ? state.ranking?.[0] : undefined;

  const card = (o: Offer, rank: number | null) => (
    <ProductCard
      key={o.id}
      offer={o}
      store={storeById.get(o.store_id)}
      rank={rank}
      best={o.id === bestId}
      includeDelivery={includeDelivery}
      auditing={running}
      comparing={state.compare.includes(o.id)}
      onCompare={toggleCompare}
      onProof={setProofId}
    />
  );

  const req = state.request;
  if (!req && state.storeOrder.length === 0) {
    return (
      <>
        <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Results" }]} />
        <PageTitle>Results</PageTitle>
        <EmptyState icon={MessagesSquare}>Tell the agent what you're hunting for, and the offers show up here.</EmptyState>
      </>
    );
  }

  const elapsed = state.elapsedS ?? null;
  const summary =
    all.length === 0
      ? running
        ? "Agents are visiting the stores. Offers appear as soon as a cart is read."
        : state.phase === "done"
          ? "No offers this time."
          : ""
      : provisional
        ? `${all.length} ${all.length === 1 ? "offer" : "offers"} so far · the ranking updates when every agent is done`
        : `${ranked.length} ranked${waiting.length ? ` · ${waiting.length} waiting on shipping` : ""}${
            elapsed != null ? ` · done in ${formatTimer(elapsed)}` : ""
          }`;

  return (
    <>
      <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Results" }]} />
      <PageTitle sub={<span aria-live="polite">{summary}</span>}>
        “{req?.query ?? "Your hunt"}”{req && req.quantity > 1 ? ` × ${req.quantity}` : ""}
      </PageTitle>

      <SandboxStage />

      {all.length > 0 || pending > 0 ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
            <FilterChip on={verifiedOnly} onToggle={() => setVerifiedOnly((v) => !v)}>
              Verified in cart only
            </FilterChip>
            <FilterChip on={shippingOnly} onToggle={() => setShippingOnly((v) => !v)}>
              Shipping known
            </FilterChip>
            <FilterChip on={inStockOnly} onToggle={() => setInStockOnly((v) => !v)}>
              In stock
            </FilterChip>
            {excluded.length ? (
              <FilterChip on={showExcluded} onToggle={() => setShowExcluded((v) => !v)}>
                {`Show excluded (${excluded.length})`}
              </FilterChip>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-label="Price shown" className="inline-flex rounded-full border bg-well p-1 inset-shadow-well">
              {[
                { value: true, label: "With delivery" },
                { value: false, label: "Product only" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={includeDelivery === opt.value}
                  onClick={() => setIncludeDelivery(opt.value)}
                  className={`h-7 rounded-full px-3 text-xs font-medium transition duration-200 ease-glide ${
                    includeDelivery === opt.value ? "bg-surface text-ink shadow-key" : "text-muted hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Sort by</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-8 rounded-lg border bg-surface px-2 text-sm shadow-key"
              >
                <option value="best">Best total for you</option>
                <option value="unit">Unit price</option>
                <option value="trust">Trust</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {main.length > 0 || pending > 0 ? (
        <ol className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5" aria-label={provisional ? "Offers so far" : "Ranked offers"}>
          {main.map((o, i) => (
            <li key={o.id} className="flex">
              {/* The number is the place in the list as shown (sort and delivery choice included). */}
              {card(o, ranks.has(o.id) || provisional ? i + 1 : null)}
            </li>
          ))}
          {Array.from({ length: Math.min(pending, 6) }, (_, i) => (
            <li key={`skeleton-${i}`} aria-hidden="true" className="rounded-2xl border bg-surface p-3">
              <div className="aspect-[4/3] animate-pulse rounded-xl bg-raised" />
              <div className="mt-4 space-y-2.5 px-1">
                <Skeleton width="45%" />
                <Skeleton width="85%" />
                <Skeleton width="35%" />
              </div>
              <p className="mt-4 px-1 text-xs text-muted">Waiting for a verified cart price…</p>
            </li>
          ))}
        </ol>
      ) : null}

      {waitingShown.length ? (
        <section className="mt-10" aria-labelledby="waiting-heading">
          <h2 id="waiting-heading" className="text-base font-semibold">
            Not ranked yet
          </h2>
          <p className="mt-0.5 text-sm text-muted">The store didn't show shipping before checkout, so the total is unknown.</p>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
            {waitingShown.map((o) => (
              <li key={o.id} className="flex">
                {card(o, null)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {othersShown.length ? (
        <section className="mt-10" aria-labelledby="other-heading">
          <h2 id="other-heading" className="text-base font-semibold">
            Other recommended items
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Close matches, but not the product you asked for, so they are not ranked against it.
          </p>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
            {othersShown.map((o) => (
              <li key={o.id} className="flex flex-col gap-1.5">
                {card(o, null)}
                {o.match_reason ? <p className="px-1 text-xs text-muted">Why separate: {o.match_reason}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {excludedShown.length ? (
        <section className="mt-10" aria-labelledby="excluded-heading">
          <h2 id="excluded-heading" className="text-base font-semibold">
            Excluded
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Labelled Fake: the cart didn't match the page (for example a hidden fee), or the product was out of stock.
          </p>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
            {excludedShown.map((o) => (
              <li key={o.id} className="flex">
                {card(o, null)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {proofOffer ? <CartProof offer={proofOffer} store={storeById.get(proofOffer.store_id)} onClose={closeProof} /> : null}

      {!running && all.length > 0 && main.length === 0 && !waitingShown.length && !othersShown.length && !excludedShown.length ? (
        <EmptyState className="mt-6" compact>
          No offers match these filters.
        </EmptyState>
      ) : null}
    </>
  );
}
