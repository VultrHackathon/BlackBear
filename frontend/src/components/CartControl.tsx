import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useHuntState } from "../state/HuntContext";
import { useShop } from "../state/ShopContext";
import type { Offer } from "../types";
import { Button } from "./ui";

export const MAX_QTY = 99;

/**
 * − [ n ] + : the quantity can be stepped or typed. With `min` 0, going below 1
 * removes the item (the caller decides what 0 means).
 */
export function QtyStepper({
  value,
  onChange,
  label,
  min = 1,
  size = "sm",
}: {
  value: number;
  onChange: (n: number) => void;
  /** What is being counted, for screen readers: "Alvedon 500 mg". */
  label: string;
  min?: number;
  size?: "sm" | "md";
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.max(min, Math.min(MAX_QTY, Math.round(n)));
  const commit = () => {
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n)) onChange(clamp(n));
    else setText(String(value));
  };
  const h = size === "md" ? "h-10" : "h-8";
  return (
    <div className="inline-flex items-center" role="group" aria-label={`Quantity of ${label}`}>
      <Button
        size={size}
        iconOnly
        icon={value - 1 < 1 && min < 1 ? Trash2 : Minus}
        aria-label={value - 1 < 1 && min < 1 ? `Remove ${label}` : `One fewer ${label}`}
        className="rounded-r-none focus-visible:z-10"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Quantity of ${label}`}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp") onChange(clamp(value + 1));
          if (e.key === "ArrowDown") onChange(clamp(value - 1));
        }}
        className={`${h} w-11 border-y bg-surface text-center text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ink/40`}
      />
      <Button
        size={size}
        iconOnly
        icon={Plus}
        aria-label={`One more ${label}`}
        className="rounded-l-none focus-visible:z-10"
        disabled={value >= MAX_QTY}
        onClick={() => onChange(clamp(value + 1))}
      />
    </div>
  );
}

/**
 * Add to cart, or, once the offer is in the cart, a quantity stepper bound to the cart
 * (stepping below 1 takes it out again). Same control on cards, the offer page and compare.
 */
export function CartControl({
  offer,
  size = "sm",
  className = "",
  startQty,
}: {
  offer: Offer;
  size?: "sm" | "md";
  className?: string;
  /** How many to add on the first click (defaults to the hunt's quantity). */
  startQty?: number;
}) {
  const { cart, addToCart, setQty } = useShop();
  const { config } = useHuntState();
  const line = cart.find((l) => l.offerId === offer.id);
  const store = config?.stores.find((s) => s.id === offer.store_id);

  if (!line) {
    return (
      <Button
        variant="primary"
        size={size}
        icon={ShoppingCart}
        className={className}
        onClick={() => addToCart(offer, store, startQty)}
      >
        Add to cart
      </Button>
    );
  }
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <QtyStepper value={line.qty} min={0} size={size} label={offer.title} onChange={(n) => setQty(offer.id, n)} />
      <span className="text-xs text-muted">in cart</span>
    </div>
  );
}
