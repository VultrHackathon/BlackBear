import { Check, Receipt, Scale, ShoppingCart, Trophy } from "lucide-react";
import { memo } from "react";
import { claimedDiscount, deliveryNote, shippingKnown, shownPrice, unrankedReason } from "../lib/deals";
import { formatSek } from "../lib/format";
import { href } from "../lib/router";
import type { Offer, StoreConfig } from "../types";
import { ProductPhoto } from "./ProductPhoto";
import { StoreMark } from "./StoreMark";
import { TRUST } from "./trust";
import { Button, Pill, Spinner } from "./ui";

/** The store's claimed discount as a round sticker. A discount judged fake is struck through. */
export function DiscountSticker({ offer, className = "" }: { offer: Offer; className?: string }) {
  const pct = claimedDiscount(offer);
  if (pct == null) return null;
  const fake = offer.trust?.label === "fake";
  return (
    <span
      className={`grid size-12 -rotate-12 place-items-center rounded-full text-xs font-extrabold tracking-tight shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45)] ${
        fake ? "border-2 border-danger bg-surface text-danger line-through" : "bg-accent text-on-accent"
      } ${className}`}
    >
      −{pct}%
      <span className="sr-only">{fake ? " claimed discount, judged fake" : " off the store's previous price"}</span>
    </span>
  );
}

export function TrustPill({ offer, auditing, size = "xs" }: { offer: Offer; auditing: boolean; size?: "xs" | "sm" }) {
  if (!offer.trust && auditing) {
    return (
      <Pill size={size} className="text-muted">
        <Spinner className="size-3" />
        Checking
      </Pill>
    );
  }
  const t = TRUST[offer.trust?.label ?? "unknown"];
  return (
    <Pill size={size} tone={t.tone} icon={t.icon} className="font-medium">
      {t.short}
    </Pill>
  );
}

/** The promo that was actually applied in the cart, if any. */
export function appliedPromo(offer: Offer): string | null {
  const p = offer.promos.find((x) => x.applied_in_cart === true && x.type !== "free_shipping_over");
  return p ? (p.code ?? p.text) : null;
}

/**
 * One offer on the shelf, as in the team's mockup: photo, rank, store, title, trust,
 * the price you pay, and Add to cart / Compare. Unranked offers are dashed and say why.
 */
export const ProductCard = memo(function ProductCard({
  offer,
  store,
  rank,
  best,
  includeDelivery,
  auditing,
  comparing,
  onAdd,
  onCompare,
  onProof,
}: {
  offer: Offer;
  store: StoreConfig | undefined;
  /** 1-based rank, or null when the offer is not ranked (or the ranking isn't in yet). */
  rank: number | null;
  best: boolean;
  includeDelivery: boolean;
  auditing: boolean;
  comparing: boolean;
  onAdd: (offer: Offer) => void;
  onCompare: (offerId: string) => void;
  /** Opens the cart screenshot for this offer. */
  onProof: (offerId: string) => void;
}) {
  const name = store?.name ?? offer.store_id;
  const link = href({ name: "offer", id: offer.id });
  const promo = appliedPromo(offer);
  const unranked = rank === null && !auditing;
  return (
    <article
      aria-labelledby={`t-${offer.id}`}
      className={`group flex w-full flex-col rounded-2xl border bg-surface p-3 transition duration-300 ease-glide motion-safe:animate-rise ${
        unranked && offer.unranked_reason ? "border-dashed border-line-strong" : "shadow-card hover:-translate-y-0.5 hover:shadow-lift"
      }`}
    >
      {/* The photo opens the proof: how it looked in the store's cart. */}
      <button
        type="button"
        data-proof-open={offer.id}
        onClick={() => onProof(offer.id)}
        aria-haspopup="dialog"
        aria-label={`See ${name}'s cart for ${offer.title}`}
        className="relative block w-full rounded-xl text-left"
      >
        <ProductPhoto src={offer.image_url} alt="" storeId={offer.store_id} storeName={name} />
        <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-md border bg-surface/95 px-1.5 py-0.5 text-[0.7rem] font-medium text-muted shadow-sm transition group-hover:border-ink group-hover:text-ink">
          <Receipt className="size-3" aria-hidden="true" />
          Cart proof
        </span>
        {rank !== null ? (
          <span
            className={`absolute top-2.5 left-2.5 inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-extrabold ${
              best ? "bg-accent text-on-accent" : "bg-ink text-white"
            }`}
          >
            {best ? <Trophy className="size-3.5" /> : null}#{rank}
          </span>
        ) : null}
        <DiscountSticker offer={offer} className="absolute -right-1.5 -bottom-2" />
      </button>

      <div className="flex flex-1 flex-col gap-2 px-1 pt-3">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <StoreMark id={offer.store_id} name={name} size="xs" decorative />
          {name}
          {!offer.in_stock ? <span className="text-ink">· out of stock</span> : null}
        </p>
        <h3 id={`t-${offer.id}`} className="line-clamp-2 text-sm leading-snug font-semibold">
          <a href={link} className="rounded-sm hover:underline hover:underline-offset-2">
            {offer.title}
          </a>
        </h3>
        <p className="flex flex-wrap gap-1.5">
          <TrustPill offer={offer} auditing={auditing} />
          {promo ? (
            <Pill size="xs" tone="strong">
              {promo} applied
            </Pill>
          ) : null}
        </p>
        <div className="mt-auto pt-1">
          <p className="text-2xl font-extrabold tracking-[-0.03em] tabular-nums">
            {formatSek(shownPrice(offer, includeDelivery))}
          </p>
          <p className="text-xs text-muted">
            {shippingKnown(offer)
              ? `${offer.quantity > 1 ? `for ${offer.quantity} · ` : ""}${deliveryNote(offer, includeDelivery, formatSek)}`
              : `Item subtotal${offer.quantity > 1 ? ` for ${offer.quantity}` : ""} · delivery not shown`}
          </p>
          {unranked ? <p className="mt-1 text-xs text-muted">Not ranked · {unrankedReason(offer)}</p> : null}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="primary" size="sm" icon={ShoppingCart} className="flex-1" onClick={() => onAdd(offer)}>
            Add to cart
          </Button>
          <Button
            size="sm"
            icon={comparing ? Check : Scale}
            aria-pressed={comparing}
            onClick={() => onCompare(offer.id)}
            className={comparing ? "border-ink" : ""}
          >
            {comparing ? "Comparing" : "Compare"}
          </Button>
        </div>
      </div>
    </article>
  );
});
