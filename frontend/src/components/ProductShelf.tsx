import { ArrowRight, PackageX, Trophy } from "lucide-react";
import { useRef, useState } from "react";
import { claimedDiscount, orderOffers, shownPrice } from "../lib/deals";
import { formatSek } from "../lib/format";
import { safeImageSrc } from "../lib/security";
import { useHuntState } from "../state/HuntContext";
import { isHuntActive, selectRankedOffers } from "../state/huntReducer";
import type { Offer, StoreConfig } from "../types";
import { EvidenceModal } from "./EvidenceModal";
import { ProofScreen } from "./ProofScreen";
import { StoreMark } from "./StoreMark";
import { TRUST } from "./trust";
import { Pill, Skeleton, Spinner } from "./ui";

/** "incl. 299 kr delivery", "+ 299 kr delivery" or "Free delivery". */
function deliveryNote(o: Offer, includeDelivery: boolean): string {
  if (o.shipping_sek === 0) return "Free delivery";
  return includeDelivery ? `incl. ${formatSek(o.shipping_sek)} delivery` : `+ ${formatSek(o.shipping_sek)} delivery`;
}

function TrustChip({ offer, auditing }: { offer: Offer; auditing: boolean }) {
  if (!offer.trust && auditing) {
    return (
      <Pill size="xs" className="border-line-strong bg-surface/95 text-muted">
        <Spinner className="size-3" />
        Checking
      </Pill>
    );
  }
  const t = TRUST[offer.trust?.label ?? "unknown"];
  return (
    <Pill size="xs" tone={t.tone} icon={t.icon} className="bg-surface/95 font-medium">
      {t.short}
    </Pill>
  );
}

/** The store's claimed discount as a round sticker. A discount judged fake is struck through. */
function DiscountSticker({ offer, large = false }: { offer: Offer; large?: boolean }) {
  const pct = claimedDiscount(offer);
  if (pct == null) return null;
  const fake = offer.trust?.label === "fake";
  return (
    <span
      className={`absolute grid -rotate-12 place-items-center rounded-full font-extrabold tracking-tight shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45)] ${
        large ? "-top-3 -right-3 size-16 text-base" : "-right-2 -bottom-3 size-12 text-xs"
      } ${fake ? "border-2 border-danger bg-surface text-danger line-through" : "bg-accent text-on-accent"}`}
    >
      −{pct}%
      <span className="sr-only">{fake ? " claimed discount, judged fake" : " off the store's previous price"}</span>
    </span>
  );
}

function ProductCard({
  offer,
  store,
  rank,
  includeDelivery,
  auditing,
  onOpen,
}: {
  offer: Offer;
  store: StoreConfig | undefined;
  rank: number;
  includeDelivery: boolean;
  auditing: boolean;
  onOpen: (offerId: string) => void;
}) {
  const name = store?.name ?? offer.store_id;
  return (
    <li className="motion-safe:animate-rise">
      <button
        type="button"
        data-offer-open={offer.id}
        onClick={() => onOpen(offer.id)}
        aria-haspopup="dialog"
        className="group block w-full rounded-2xl text-left"
      >
        <div className="relative rounded-2xl bg-raised px-5 pt-9 pb-6 transition duration-300 ease-glide group-hover:bg-well">
          <span className="absolute top-3 left-3 font-mono text-2xs text-muted">#{rank}</span>
          <span className="absolute top-2.5 right-3">
            <TrustChip offer={offer} auditing={auditing} />
          </span>
          <div className="relative transition duration-500 ease-glide group-hover:-translate-y-1">
            <ProofScreen src={safeImageSrc(offer.screenshot_url)} alt={`Screenshot from ${name}`} />
            <DiscountSticker offer={offer} />
          </div>
        </div>
        <div className="mt-3 px-1">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <StoreMark id={offer.store_id} name={name} size="xs" decorative />
            {name}
            {!offer.in_stock ? (
              <span className="inline-flex items-center gap-1 text-ink">
                · <PackageX className="size-3.5" aria-hidden="true" /> out of stock
              </span>
            ) : null}
          </p>
          <h3 className="mt-1 line-clamp-2 text-sm leading-snug font-semibold">{offer.title}</h3>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold tracking-tight tabular-nums">
              {formatSek(shownPrice(offer, includeDelivery))}
            </span>
            <span className="text-xs text-muted">{deliveryNote(offer, includeDelivery)}</span>
          </p>
        </div>
      </button>
    </li>
  );
}

/** The best offer, big: the storefront's hero product. */
function FeatureCard({
  offer,
  store,
  includeDelivery,
  onOpen,
}: {
  offer: Offer;
  store: StoreConfig | undefined;
  includeDelivery: boolean;
  onOpen: (offerId: string) => void;
}) {
  const name = store?.name ?? offer.store_id;
  const t = TRUST[offer.trust?.label ?? "unknown"];
  const applied = offer.promos.find((p) => p.applied_in_cart === true && p.type !== "free_shipping_over");
  return (
    <article
      aria-labelledby={`feature-${offer.id}`}
      className="theme-dark relative isolate grid gap-6 overflow-hidden rounded-[1.75rem] bg-canvas p-5 shadow-lift motion-safe:animate-rise sm:p-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center"
    >
      <div
        className="pointer-events-none absolute -top-24 -left-24 -z-10 size-96 bg-[radial-gradient(closest-side,rgb(255_194_26/0.22),transparent)]"
        aria-hidden="true"
      />
      <button
        type="button"
        data-offer-open={offer.id}
        onClick={() => onOpen(offer.id)}
        aria-haspopup="dialog"
        aria-label={`See the proof for ${name}`}
        className="group relative block rounded-2xl"
      >
        <span className="block transition duration-500 ease-glide group-hover:-translate-y-1 md:[transform:perspective(1200px)_rotateY(8deg)_rotateX(2deg)] md:group-hover:[transform:perspective(1200px)_rotateY(3deg)_rotateX(1deg)]">
          <ProofScreen large src={safeImageSrc(offer.screenshot_url)} alt={`Screenshot from ${name}`} />
        </span>
        <DiscountSticker offer={offer} large />
      </button>

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Pill className="border-transparent bg-accent font-semibold text-on-accent" icon={Trophy}>
            Best deal
          </Pill>
          <Pill tone={t.tone} icon={t.icon}>
            {t.short}
          </Pill>
        </p>
        <p className="mt-5 flex items-center gap-2 text-sm text-muted">
          <StoreMark id={offer.store_id} name={name} size="sm" decorative />
          {name}
        </p>
        <h3 id={`feature-${offer.id}`} className="mt-2 text-xl leading-tight font-bold tracking-tight sm:text-2xl">
          {offer.title}
        </h3>
        <p className="mt-5 text-5xl font-extrabold tracking-[-0.04em] tabular-nums sm:text-6xl">
          {formatSek(shownPrice(offer, includeDelivery))}
        </p>
        <p className="mt-2 text-sm text-muted">
          {deliveryNote(offer, includeDelivery)}
          {offer.quantity > 1 ? ` · for ${offer.quantity}` : ""}
          {applied ? ` · ${applied.code ?? applied.text} applied` : ""}
        </p>
        <button
          type="button"
          onClick={() => onOpen(offer.id)}
          aria-haspopup="dialog"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-black/15 bg-accent bg-linear-to-b from-accent-hover to-accent px-5 text-sm font-semibold text-on-accent shadow-accent transition duration-150 ease-press hover:shadow-accent-hover active:translate-y-px active:shadow-accent-pressed"
        >
          See the proof
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

/**
 * Step 3: the products. The best deal gets the stage; the rest sit on a shelf.
 * Every image is the agent's own screenshot.
 */
export function ProductShelf({
  includeDelivery,
  onIncludeDelivery,
}: {
  includeDelivery: boolean;
  onIncludeDelivery: (value: boolean) => void;
}) {
  const state = useHuntState();
  const { offers: ranked, provisional } = selectRankedOffers(state);
  const offers = orderOffers(ranked, includeDelivery);
  const running = isHuntActive(state.phase);
  const storeById = new Map(state.config?.stores.map((s) => [s.id, s]) ?? []);
  const shelfRef = useRef<HTMLElement>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const openOffer = openId ? state.offers[openId] : undefined;
  const closeEvidence = () => {
    const last = openId;
    setOpenId(null);
    if (last) shelfRef.current?.querySelector<HTMLButtonElement>(`[data-offer-open="${CSS.escape(last)}"]`)?.focus();
  };

  const searching = state.storeOrder.length > 0 && running;
  if (offers.length === 0 && !searching && state.phase !== "done") return null;

  const [best, ...rest] = offers;
  const feature = !provisional && best ? best : null;
  const shelf = feature ? rest : offers;

  return (
    <section id="products" ref={shelfRef} aria-labelledby="products-heading" className="scroll-mt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-muted">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            Step 3
          </p>
          <h2 id="products-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Best finds
          </h2>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {offers.length === 0
              ? searching
                ? "Finding prices…"
                : "No offers this time."
              : provisional
                ? `${offers.length} so far`
                : `${offers.length} ${offers.length === 1 ? "offer" : "offers"}, ranked`}
          </p>
        </div>

        {offers.length > 0 ? (
          <div
            role="radiogroup"
            aria-label="Price shown"
            className="inline-flex rounded-full border bg-well p-1 inset-shadow-well"
          >
            {[
              { value: true, label: "With delivery" },
              { value: false, label: "Product only" },
            ].map((opt) => {
              const on = includeDelivery === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onIncludeDelivery(opt.value)}
                  className={`h-8 rounded-full px-3.5 text-xs font-medium transition duration-200 ease-glide ${
                    on ? "bg-surface text-ink shadow-key" : "text-muted hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-6">
        {feature ? (
          <FeatureCard
            offer={feature}
            store={storeById.get(feature.store_id)}
            includeDelivery={includeDelivery}
            onOpen={setOpenId}
          />
        ) : null}

        {offers.length === 0 && searching ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-5 gap-y-8" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <div className="aspect-[4/3] animate-pulse rounded-2xl bg-raised" />
                <div className="mt-3 space-y-2 px-1">
                  <Skeleton width="40%" />
                  <Skeleton width="80%" />
                </div>
              </li>
            ))}
          </ul>
        ) : shelf.length > 0 ? (
          <ol
            className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-5 gap-y-8"
            aria-label={feature ? "More offers" : "Offers so far"}
          >
            {shelf.map((offer) => (
              <ProductCard
                key={offer.id}
                offer={offer}
                store={storeById.get(offer.store_id)}
                rank={offers.indexOf(offer) + 1}
                includeDelivery={includeDelivery}
                auditing={running}
                onOpen={setOpenId}
              />
            ))}
          </ol>
        ) : null}
      </div>

      {openOffer ? (
        <EvidenceModal
          offer={openOffer}
          store={storeById.get(openOffer.store_id)}
          includeDelivery={includeDelivery}
          onClose={closeEvidence}
        />
      ) : null}
    </section>
  );
}
