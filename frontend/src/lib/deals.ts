/**
 * Arithmetic on offers the backend already priced. Used to decide whether the agent
 * has a question worth asking. Every number here comes from the offer itself.
 */
import { hasMembership } from "./membership";
import type { Offer, Promo } from "../types";

/** What the products cost without delivery. */
export function itemsTotal(o: Offer): number {
  return Math.max(0, o.effective_total_sek - o.shipping_sek);
}

/** The price shown for an offer: with or without delivery. */
export function shownPrice(o: Offer, includeDelivery: boolean): number {
  return includeDelivery ? o.effective_total_sek : itemsTotal(o);
}

/**
 * Offers in display order. With delivery, the backend's ranking order is kept; without
 * delivery they are re-sorted on the product price only (stable, so ties keep the ranking).
 */
export function orderOffers(offers: Offer[], includeDelivery: boolean): Offer[] {
  if (includeDelivery) return offers;
  return offers
    .map((o, i) => ({ o, i }))
    .sort((a, b) => itemsTotal(a.o) - itemsTotal(b.o) || a.i - b.i)
    .map(({ o }) => o);
}

/**
 * When leaving delivery out changes which store is cheapest, returns that store's offer.
 * That is the only time the delivery question is worth asking.
 */
export function deliveryChangesWinner(ranked: Offer[]): Offer | null {
  const withDelivery = ranked[0];
  const withoutDelivery = orderOffers(ranked, false)[0];
  if (!withDelivery || !withoutDelivery) return null;
  return withoutDelivery.store_id !== withDelivery.store_id ? withoutDelivery : null;
}

/**
 * The item total if the shopper had the membership a promo needs. Mirrors how a cart
 * applies member prices and multi-buys. Null when the promo can't be priced from its
 * fields alone.
 */
function memberItemsTotal(o: Offer, p: Promo): number | null {
  const q = o.quantity;
  const unit = o.price_sek;
  if (p.type === "member_price" && p.bundle_price_sek != null) return Math.min(unit, p.bundle_price_sek) * q;
  if (p.type === "multibuy" && p.buy) {
    const groups = Math.floor(q / p.buy);
    const rest = q % p.buy;
    if (p.bundle_price_sek != null) return groups * p.bundle_price_sek + rest * unit;
    if (p.pay_for != null) return (groups * p.pay_for + rest) * unit;
  }
  if ((p.type === "percent_off" || p.type === "code") && p.percent) return itemsTotal(o) * (1 - p.percent / 100);
  return null;
}

export interface MembershipChance {
  offer: Offer;
  /** As the promo names it, e.g. "Stammis". */
  membership: string;
  promo: Promo;
  /** What the shopper would pay as a member, delivery included. */
  memberTotal: number;
}

/**
 * The best member-only price the shopper is not using, but only when it would beat
 * the current best deal. Otherwise there is nothing worth asking.
 */
export function membershipBeatsBest(ranked: Offer[], memberships: readonly string[]): MembershipChance | null {
  const best = ranked[0];
  if (!best) return null;
  let found: MembershipChance | null = null;
  for (const offer of ranked) {
    for (const promo of offer.promos) {
      const required = promo.requires_membership;
      if (!required || hasMembership(memberships, required)) continue;
      const items = memberItemsTotal(offer, promo);
      if (items == null) continue;
      const memberTotal = Math.round(items + offer.shipping_sek);
      if (memberTotal >= best.effective_total_sek || memberTotal >= offer.effective_total_sek) continue;
      if (!found || memberTotal < found.memberTotal) found = { offer, membership: required, promo, memberTotal };
    }
  }
  return found;
}

/** The store's claimed discount, from its own previous price. Null when it claims none. */
export function claimedDiscount(o: Offer): number | null {
  const prev = o.previous_price_sek;
  if (prev == null || prev <= o.price_sek) return null;
  const pct = Math.round(((prev - o.price_sek) / prev) * 100);
  return pct >= 1 ? pct : null;
}
