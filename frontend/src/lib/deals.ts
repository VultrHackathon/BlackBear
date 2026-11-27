/**
 * Arithmetic on offers the backend already priced. Every number here comes from the
 * offer itself.
 *
 * Ranking rule (backend `dealmath.rank`): only offers with a known shipping fee, a cart
 * that matches and stock are ranked. `state.ranking` lists exactly those, best first.
 * Anything else is "not ranked", with `unranked_reason` saying why. When shipping is
 * unknown, `effective_total_sek` is the item subtotal only.
 */
import { hasMembership } from "./membership";
import type { Offer, Promo } from "../types";

export function shippingKnown(o: Offer): o is Offer & { shipping_sek: number } {
  return o.shipping_sek !== null;
}

/** What the products cost without delivery. */
export function itemsTotal(o: Offer): number {
  return shippingKnown(o) ? Math.max(0, o.effective_total_sek - o.shipping_sek) : o.effective_total_sek;
}

/** The price shown for an offer: with or without delivery. With unknown shipping it is the subtotal either way. */
export function shownPrice(o: Offer, includeDelivery: boolean): number {
  return includeDelivery ? o.effective_total_sek : itemsTotal(o);
}

/** 1-based rank per offer id; offers not in the map are not ranked. */
export function rankMap(ranking: readonly string[] | null): Map<string, number> {
  return new Map((ranking ?? []).map((id, i) => [id, i + 1]));
}

/** The ranked offers, best first. Empty until the ranking arrives, or when nothing could be ranked. */
export function rankedOffers(offers: Record<string, Offer>, ranking: readonly string[] | null): Offer[] {
  return (ranking ?? []).map((id) => offers[id]).filter((o): o is Offer => !!o);
}

/** Why an offer is not ranked, in a few words. */
export function unrankedReason(o: Offer): string {
  return o.unranked_reason ?? (shippingKnown(o) ? "excluded" : "shipping not shown");
}

/**
 * Within the ranked offers only: with delivery keep the backend's order, without it
 * sort on the product price (stable, so ties keep the ranking).
 */
export function orderRanked(ranked: Offer[], includeDelivery: boolean): Offer[] {
  if (includeDelivery) return ranked;
  return ranked
    .map((o, i) => ({ o, i }))
    .sort((a, b) => itemsTotal(a.o) - itemsTotal(b.o) || a.i - b.i)
    .map(({ o }) => o);
}

/**
 * When leaving delivery out changes which ranked store is cheapest, returns that
 * store's offer. That is the only time the delivery question is worth asking.
 */
export function deliveryChangesWinner(ranked: Offer[]): Offer | null {
  const withDelivery = ranked[0];
  const withoutDelivery = orderRanked(ranked, false)[0];
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
 * The best member-only price the shopper is not using, among ranked offers, but only
 * when it would beat the best deal. Otherwise there is nothing worth asking.
 */
export function membershipBeatsBest(ranked: Offer[], memberships: readonly string[]): MembershipChance | null {
  const best = ranked[0];
  if (!best) return null;
  let found: MembershipChance | null = null;
  for (const offer of ranked) {
    if (!shippingKnown(offer)) continue;
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

/** "incl. 299 kr delivery", "+ 299 kr delivery", "Free delivery" or "Delivery not shown". */
export function deliveryNote(o: Offer, includeDelivery: boolean, sek: (n: number) => string): string {
  if (!shippingKnown(o)) return "Delivery not shown";
  if (o.shipping_sek === 0) return "Free delivery";
  return includeDelivery ? `incl. ${sek(o.shipping_sek)} delivery` : `+ ${sek(o.shipping_sek)} delivery`;
}
