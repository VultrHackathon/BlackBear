import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { itemsTotal } from "../lib/deals";
import type { Offer, TrustLabel } from "../types";

/**
 * The storefront's own state, separate from the hunt: the cart (a shortlist, nothing is
 * bought here), the toast, the mini cart and whether prices include delivery.
 *
 * Cart lines are snapshots of the offer, so they survive a new hunt.
 */
export interface CartLine {
  offerId: string;
  storeId: string;
  storeName: string;
  storeDomain: string | null;
  title: string;
  imageUrl?: string;
  /** Page address, shown as plain text only. */
  url: string;
  /** What one unit costs without delivery, as the hunt priced it. */
  unitItems: number;
  /** Delivery for this store, or null when the store didn't show it. */
  shipping: number | null;
  trust: TrustLabel;
  promo?: string;
  qty: number;
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

interface Shop {
  cart: CartLine[];
  cartCount: number;
  addToCart: (offer: Offer, store: { name: string; domain?: string } | undefined) => void;
  setQty: (offerId: string, qty: number) => void;
  removeLine: (offerId: string) => void;
  miniOpen: boolean;
  setMiniOpen: (open: boolean) => void;
  toast: Toast | null;
  showToast: (text: string, action?: Toast["action"]) => void;
  includeDelivery: boolean;
  setIncludeDelivery: (v: boolean) => void;
}

const ShopCtx = createContext<Shop | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [miniOpen, setMiniOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const toastTimer = useRef<number | undefined>(undefined);
  const toastSeq = useRef(0);

  const showToast = useCallback((text: string, action?: Toast["action"]) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: ++toastSeq.current, text, action });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const addToCart = useCallback<Shop["addToCart"]>(
    (offer, store) => {
      const applied = offer.promos.find((p) => p.applied_in_cart === true && p.type !== "free_shipping_over");
      setCart((lines) => {
        const existing = lines.find((l) => l.offerId === offer.id);
        if (existing) return lines.map((l) => (l === existing ? { ...l, qty: l.qty + offer.quantity } : l));
        return [
          ...lines,
          {
            offerId: offer.id,
            storeId: offer.store_id,
            storeName: store?.name ?? offer.store_id,
            storeDomain: store?.domain ?? null,
            title: offer.title,
            imageUrl: offer.image_url,
            url: offer.url,
            unitItems: Math.round((itemsTotal(offer) / Math.max(1, offer.quantity)) * 100) / 100,
            shipping: offer.shipping_sek,
            trust: offer.trust?.label ?? "unknown",
            promo: applied ? (applied.code ?? applied.text) : undefined,
            qty: offer.quantity,
          },
        ];
      });
      showToast(`Added ${store?.name ?? offer.store_id} · ${offer.quantity} st`, {
        label: "View cart",
        onClick: () => setMiniOpen(true),
      });
    },
    [showToast],
  );

  const setQty = useCallback((offerId: string, qty: number) => {
    setCart((lines) =>
      qty < 1 ? lines.filter((l) => l.offerId !== offerId) : lines.map((l) => (l.offerId === offerId ? { ...l, qty } : l)),
    );
  }, []);
  const removeLine = useCallback((offerId: string) => setCart((lines) => lines.filter((l) => l.offerId !== offerId)), []);

  const value = useMemo<Shop>(
    () => ({
      cart,
      cartCount: cart.reduce((n, l) => n + l.qty, 0),
      addToCart,
      setQty,
      removeLine,
      miniOpen,
      setMiniOpen,
      toast,
      showToast,
      includeDelivery,
      setIncludeDelivery,
    }),
    [cart, addToCart, setQty, removeLine, miniOpen, toast, showToast, includeDelivery],
  );
  return <ShopCtx.Provider value={value}>{children}</ShopCtx.Provider>;
}

export function useShop(): Shop {
  const ctx = useContext(ShopCtx);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}

/** Cart lines grouped by store, with each store's delivery counted once. */
export function cartTotals(cart: CartLine[]) {
  const byStore = new Map<string, CartLine[]>();
  for (const l of cart) byStore.set(l.storeId, [...(byStore.get(l.storeId) ?? []), l]);
  let items = 0;
  let shipping = 0;
  let unknownShipping = 0;
  for (const lines of byStore.values()) {
    for (const l of lines) items += l.unitItems * l.qty;
    const fee = lines[0]?.shipping;
    if (fee == null) unknownShipping++;
    else shipping += fee;
  }
  return { byStore, items: Math.round(items * 100) / 100, shipping, unknownShipping };
}
