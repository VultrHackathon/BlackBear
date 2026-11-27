import { Camera, Check, PackageSearch, Receipt, RefreshCw, Scale, ShieldCheck, ShieldExclamationPoint, ShoppingCart } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { CartControl, QtyStepper } from "../components/CartControl";
import { CopyText } from "../components/CopyText";
import { ActionLine } from "../components/Monitor";
import { DiscountSticker, TrustPill } from "../components/ProductCard";
import { ProductPhoto } from "../components/ProductPhoto";
import { PromoChip } from "../components/PromoChip";
import { Crumbs } from "../components/SiteChrome";
import { StoreMark } from "../components/StoreMark";
import { TRUST } from "../components/trust";
import { Button, EmptyState, Pill, Spinner } from "../components/ui";
import { deliveryNote, itemsTotal, rankMap, shippingKnown, shownPrice, unrankedReason } from "../lib/deals";
import { formatClock, formatDateTime, formatSek } from "../lib/format";
import { kindLabel, layerLabel } from "../lib/labels";
import { hostMatchesDomain, hostnameOf, safeImageSrc } from "../lib/security";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import { isHuntActive } from "../state/huntReducer";
import { useShop } from "../state/ShopContext";

interface View {
  key: string;
  label: string;
  /** null = the product photo slot. */
  src: string | null;
}

const TABS = ["Price check", "Agent log", "Safety"] as const;

/**
 * The product page from the team's mockup: the product photo first, then the
 * screenshots the agent took as proof; a buy box with the price worked out by code;
 * and the evidence in three tabs.
 */
export function OfferPage({ id }: { id: string }) {
  const state = useHuntState();
  const { reverify, toggleCompare } = useHuntActions();
  const { addToCart, includeDelivery, cart } = useShop();
  const [viewKey, setViewKey] = useState("photo");
  const [tab, setTab] = useState(0);
  const [pickQtyRaw, setPickQty] = useState<number | null>(null);

  const offer = state.offers[id];
  if (!offer) {
    return (
      <>
        <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Results", to: { name: "results" } }, { label: "Offer" }]} />
        <EmptyState icon={PackageSearch}>This offer belongs to an earlier hunt. Start a new one from the chat.</EmptyState>
      </>
    );
  }

  const store = state.config?.stores.find((s) => s.id === offer.store_id);
  const name = store?.name ?? offer.store_id;
  const run = state.stores[offer.store_id];
  const rv = state.reverify[offer.id];
  const rank = rankMap(state.ranking).get(offer.id) ?? null;
  const running = isHuntActive(state.phase);
  const trust = TRUST[offer.trust?.label ?? "unknown"];
  const known = shippingKnown(offer);
  const gross = offer.price_sek * offer.quantity;
  const items = itemsTotal(offer);
  const saved = Math.round((gross - items) * 100) / 100;
  const host = hostnameOf(offer.url);
  const hostOk = store?.domain ? hostMatchesDomain(offer.url, store.domain) : false;
  const attacks = state.security.filter((e) => e.store_id === offer.store_id);
  const comparing = state.compare.includes(offer.id);
  const pickQty = pickQtyRaw ?? offer.quantity;
  const inCart = cart.some((l) => l.offerId === offer.id);

  // The gallery: the photo, then every screenshot we hold for this offer, without repeats.
  const views: View[] = [{ key: "photo", label: "Product", src: null }];
  const seen = new Set<string>();
  const addShot = (key: string, label: string, raw: string | undefined | null) => {
    const src = safeImageSrc(raw);
    if (src && !seen.has(src)) {
      seen.add(src);
      views.push({ key, label, src });
    }
  };
  addShot("cart", "Cart", offer.screenshot_url);
  if (rv && "shot" in rv) addShot("recheck", "Re-check", rv.shot);
  const frames = run?.frames ?? [];
  // Newest first; "Step n" counts the screenshots kept, oldest = 1.
  [...frames].reverse().forEach((f) => {
    const n = frames.indexOf(f) + 1;
    addShot(`f${f.key}`, `Step ${n}${f.label ? ` · ${f.label}` : ""}`, f.src);
  });
  const view = views.find((v) => v.key === viewKey) ?? views[0]!;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (tab + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(next);
    document.getElementById(`offer-tab-${next}`)?.focus();
  };

  return (
    <>
      <Crumbs
        trail={[
          { label: "Home", to: { name: "home" } },
          { label: "Results", to: { name: "results" } },
          { label: name },
        ]}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Gallery */}
        <section aria-label="Photos and screenshots">
          <div className="relative">
            {view.src === null ? (
              <button
                type="button"
                disabled={!views.some((v) => v.key === "cart")}
                onClick={() => setViewKey("cart")}
                aria-label={`${offer.title}. See it in the ${name} cart`}
                className="group relative block w-full rounded-2xl text-left"
              >
                <ProductPhoto
                  src={offer.image_url}
                  alt={offer.title}
                  storeId={offer.store_id}
                  storeName={name}
                  className="aspect-[4/3] rounded-2xl"
                  pad="p-[10%]"
                />
                {views.some((v) => v.key === "cart") ? (
                  <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg border bg-surface/95 px-2.5 py-1 text-xs font-medium shadow-sm transition group-hover:border-ink">
                    <Receipt className="size-3.5" aria-hidden="true" />
                    See it in the cart
                  </span>
                ) : null}
              </button>
            ) : (
              <figure className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-white">
                <img
                  src={view.src}
                  alt={`${view.label} screenshot taken by the ${name} sandbox`}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover object-top"
                />
                <figcaption className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-black/75 px-2 py-1 text-xs text-white">
                  <Camera className="size-3.5" aria-hidden="true" />
                  {view.label} · sandbox screenshot
                </figcaption>
              </figure>
            )}
            {view.src === null ? <DiscountSticker offer={offer} className="absolute -top-2 -right-2 size-16 text-base" /> : null}
          </div>
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label="Choose a view">
            {views.map((v) => (
              <li key={v.key}>
                <button
                  type="button"
                  aria-pressed={v.key === view.key}
                  onClick={() => setViewKey(v.key)}
                  className={`relative block aspect-[4/3] w-full overflow-hidden rounded-lg border-2 bg-white transition ${
                    v.key === view.key ? "border-ink" : "border-transparent hover:border-line-strong"
                  }`}
                >
                  {v.src === null ? (
                    <ProductPhoto src={offer.image_url} alt="" storeId={offer.store_id} storeName={name} className="size-full rounded-md border-0" pad="p-1.5" />
                  ) : (
                    <img src={v.src} alt="" referrerPolicy="no-referrer" draggable={false} className="size-full object-cover object-top" />
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[0.6rem] text-white">{v.label.split(" · ")[0]}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Screenshots were taken inside the sandbox while the price was read. They are your proof.
          </p>
        </section>

        {/* Buy box */}
        <section aria-labelledby="offer-title" className="rounded-2xl border bg-surface p-5 shadow-card lg:sticky lg:top-24 sm:p-6">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <StoreMark id={offer.store_id} name={name} size="sm" decorative />
            <span className="font-semibold">{name}</span>
            <TrustPill offer={offer} auditing={running} size="sm" />
          </p>
          <h1 id="offer-title" className="mt-3 text-xl leading-snug font-bold tracking-tight sm:text-2xl">
            {offer.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {rank !== null ? `Ranked #${rank}` : running && state.ranking === null ? "Ranking when every agent is done" : `Not ranked · ${unrankedReason(offer)}`}
          </p>

          <p className="mt-4 text-4xl font-extrabold tracking-[-0.04em] tabular-nums">
            {formatSek(shownPrice(offer, includeDelivery))}
            {!known ? <span className="ml-2 align-middle text-sm font-medium tracking-normal text-muted">+ delivery</span> : null}
          </p>
          <p className="mt-1 text-sm text-muted">
            {known ? `${deliveryNote(offer, includeDelivery, formatSek)} · ` : ""}
            {formatSek(offer.price_sek)} / st{offer.quantity > 1 ? ` · for ${offer.quantity}` : ""}
            {offer.lowest_30d_price_sek != null ? ` · 30-day low ${formatSek(offer.lowest_30d_price_sek)}` : ""}
          </p>
          {offer.promos.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Promotions">
              {offer.promos.map((p, i) => (
                <PromoChip key={`${p.type}-${i}`} promo={p} memberships={state.request?.memberships ?? []} />
              ))}
            </ul>
          ) : null}

          <table className="mt-5 w-full text-sm">
            <caption className="sr-only">Price breakdown</caption>
            <tbody>
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-muted">
                  {offer.quantity} × {formatSek(offer.price_sek)}
                </th>
                <td className="py-1.5 text-right tabular-nums">{formatSek(gross)}</td>
              </tr>
              {saved > 0.5 ? (
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal text-muted">
                    Promos and codes
                  </th>
                  <td className="py-1.5 text-right tabular-nums">−{formatSek(saved)}</td>
                </tr>
              ) : null}
              <tr>
                <th scope="row" className="py-1.5 text-left font-normal text-muted">
                  Delivery
                </th>
                <td className="py-1.5 text-right tabular-nums">
                  {!known ? "not shown" : offer.shipping_sek === 0 ? "Free" : formatSek(offer.shipping_sek)}
                </td>
              </tr>
              <tr className="border-t">
                <th scope="row" className="pt-2.5 text-left font-bold">
                  You pay
                </th>
                <td className="pt-2.5 text-right text-base font-extrabold tabular-nums">
                  {known ? formatSek(offer.effective_total_sek) : `${formatSek(items)} + delivery`}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Worked out by code from the page, then checked against the store's cart.</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {inCart ? (
              <CartControl offer={offer} size="md" className="min-w-40 flex-1" />
            ) : (
              <>
                <QtyStepper value={pickQty} onChange={setPickQty} label={offer.title} size="md" />
                <Button
                  variant="primary"
                  icon={ShoppingCart}
                  className="min-w-40 flex-1"
                  onClick={() => addToCart(offer, store, pickQty)}
                >
                  Add {pickQty} to cart
                </Button>
              </>
            )}
            <Button icon={comparing ? Check : Scale} aria-pressed={comparing} onClick={() => toggleCompare(offer.id)}>
              {comparing ? "Comparing" : "Compare"}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="ink" size="sm" icon={RefreshCw} loading={rv?.status === "pending"} onClick={() => void reverify(offer.id)}>
              {rv?.status === "pending" ? "Checking…" : "Check the price again"}
            </Button>
            <p className="min-w-0 text-sm" aria-live="polite">
              {rv?.status === "pending" ? (
                <span className="inline-flex items-center gap-2 text-muted">
                  <Spinner /> In a fresh sandbox
                </span>
              ) : rv?.status === "same" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4" aria-hidden="true" /> Same price
                  <span className="font-mono text-xs text-muted">{formatClock(rv.at)}</span>
                </span>
              ) : rv?.status === "changed" ? (
                <span className="tabular-nums">
                  Now {formatSek(rv.price)} <span className="text-muted">(was {formatSek(rv.previous)})</span>
                </span>
              ) : rv?.status === "error" ? (
                <span>Couldn't check: {rv.message}</span>
              ) : null}
            </p>
          </div>
        </section>
      </div>

      {/* Evidence */}
      <div role="tablist" aria-label="Evidence" className="mt-10 flex gap-1 border-b">
        {TABS.map((t, i) => (
          <button
            key={t}
            id={`offer-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={tab === i}
            aria-controls={`offer-panel-${i}`}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => setTab(i)}
            onKeyDown={onTabKey}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === i ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div id={`offer-panel-${tab}`} role="tabpanel" aria-labelledby={`offer-tab-${tab}`} className="pt-5">
        {tab === 0 ? (
          <div className="max-w-3xl space-y-3">
            <Pill tone={trust.tone} icon={trust.icon}>
              {trust.heading}
            </Pill>
            {offer.trust?.reasons.length ? (
              <ul className="space-y-1.5 text-sm">
                {offer.trust.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                    <span className="min-w-0 break-words">{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{running ? "The auditor is still checking this offer." : "The auditor gave no reasons."}</p>
            )}
            {offer.captured_at ? (
              <p className="text-xs text-muted">
                Price read <time dateTime={offer.captured_at}>{formatDateTime(offer.captured_at)}</time>
              </p>
            ) : null}
          </div>
        ) : tab === 1 ? (
          run && run.actions.length ? (
            <ol className="max-w-3xl space-y-0.5 rounded-xl border bg-well px-4 py-3 font-mono text-xs leading-6 inset-shadow-well" aria-label={`Actions in ${name}`}>
              {run.actions.map((a) => (
                <ActionLine key={a.key} entry={a} detailed />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">No actions were kept for this store.</p>
          )
        ) : (
          <div className="max-w-3xl space-y-5">
            <p className="text-sm">
              This browser could only reach <b>{store?.domain ?? "the store's own site"}</b>. No login, checkout or payment
              was attempted.
            </p>
            {attacks.length ? (
              <ul className="space-y-2" aria-label="Attacks at this store">
                {attacks.map((e) => (
                  <li key={e.key} className="flex items-start gap-2 text-sm">
                    {e.blocked ? (
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-safe" aria-hidden="true" />
                    ) : (
                      <ShieldExclamationPoint className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                    )}
                    <span>
                      <b>{kindLabel(e.kind)}</b> · {e.blocked ? "stopped by" : "got past"} the {layerLabel(e.layer).toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <p className="mb-1 text-xs text-muted">Page address (plain text, never a link)</p>
              <CopyText text={offer.url} />
              {store?.domain ? (
                hostOk ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-safe">
                    <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                    {host} is {name}'s own site
                  </p>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-danger">
                    <ShieldExclamationPoint className="size-3.5 shrink-0" aria-hidden="true" />
                    {host ?? "Unknown host"} is not {store.domain}
                  </p>
                )
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
