import { BadgePercent, IdCard, Layers, Tag, TicketPercent, Truck, type LucideIcon } from "lucide-react";
import { hasMembership } from "../lib/membership";
import type { Promo } from "../types";

const ICONS: Record<string, LucideIcon> = {
  multibuy: Layers,
  percent_off: BadgePercent,
  amount_off: Tag,
  member_price: IdCard,
  code: TicketPercent,
  free_shipping_over: Truck,
};

export type PromoState = "applied" | "not_applied" | "unchecked";

/** The conditions shown after the promo text, e.g. "Stammis only · not applied in guest cart". */
export function describePromo(promo: Promo, memberships: readonly string[]) {
  const conditions: string[] = [];
  if (promo.code && !promo.text.includes(promo.code)) conditions.push(`code ${promo.code}`);

  const required = promo.requires_membership;
  if (required) {
    conditions.push(hasMembership(memberships, required) ? `${required} · you're a member` : `${required} only`);
  }

  let state: PromoState;
  if (promo.applied_in_cart === true) {
    conditions.push("applied in cart");
    state = "applied";
  } else if (promo.applied_in_cart === false) {
    conditions.push(required ? "not applied in guest cart" : "not applied in cart");
    state = "not_applied";
  } else {
    if (required) conditions.push("not checked in cart");
    state = "unchecked";
  }
  return { conditions, state };
}

export function PromoChip({ promo, memberships }: { promo: Promo; memberships: readonly string[] }) {
  const Icon = ICONS[promo.type] ?? Tag;
  const { conditions, state } = describePromo(promo, memberships);
  const full = [promo.text, ...conditions].join(" · ");
  return (
    <li
      className={`inline-flex max-w-full items-start gap-1.5 rounded-md border px-2 py-1 text-xs ${
        state === "not_applied" ? "border-dashed border-line-strong text-muted" : "border-line-strong text-ink"
      }`}
      title={full}
    >
      <Icon className="mt-px size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 break-words">
        <span className="font-medium">{promo.text}</span>
        {conditions.length ? <span className="text-muted"> · {conditions.join(" · ")}</span> : null}
      </span>
    </li>
  );
}
