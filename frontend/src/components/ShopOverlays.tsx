import { ShoppingCart, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatSek } from "../lib/format";
import { navigate } from "../lib/router";
import { cartTotals, useShop } from "../state/ShopContext";
import { QtyStepper } from "./CartControl";
import { ProductPhoto } from "./ProductPhoto";
import { Button } from "./ui";

/** The mini cart: a native modal dialog sliding in from the right. */
export function MiniCart() {
  const { cart, miniOpen, setMiniOpen, setQty } = useShop();
  const ref = useRef<HTMLDialogElement>(null);
  const t = cartTotals(cart);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (miniOpen && !d.open) d.showModal();
    if (!miniOpen && d.open) d.close();
  }, [miniOpen]);

  return (
    <dialog
      ref={ref}
      aria-label="Cart"
      onClose={() => setMiniOpen(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) setMiniOpen(false);
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(24rem,100vw)] max-w-none bg-surface p-0 text-ink shadow-float backdrop:bg-black/40 backdrop:backdrop-blur-[2px] motion-safe:animate-[pop_0.28s_var(--ease-glide)_both]"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold">
            <ShoppingCart className="size-4" aria-hidden="true" />
            Cart
          </h2>
          <Button variant="ghost" iconOnly icon={X} aria-label="Close cart" onClick={() => setMiniOpen(false)} />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {cart.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Your cart is empty.</p>
          ) : (
            <ul className="divide-y">
              {cart.map((l) => (
                <li key={l.offerId} className="flex gap-3 py-3">
                  <ProductPhoto src={l.imageUrl} alt="" storeId={l.storeId} storeName={l.storeName} className="aspect-square w-14 shrink-0" pad="p-1" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{l.storeName}</p>
                    <p className="line-clamp-1 text-xs text-muted">{l.title}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <QtyStepper value={l.qty} min={0} label={l.title} onChange={(n) => setQty(l.offerId, n)} />
                      <b className="text-xs tabular-nums">{formatSek(l.unitItems * l.qty)}</b>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="border-t px-5 py-4">
          <p className="mb-3 flex items-center justify-between text-sm">
            <span>Estimated total</span>
            <b className="tabular-nums">
              {formatSek(t.items + t.shipping)}
              {t.unknownShipping ? " + delivery" : ""}
            </b>
          </p>
          <Button
            variant="ink"
            className="w-full"
            disabled={cart.length === 0}
            onClick={() => {
              setMiniOpen(false);
              navigate({ name: "cart" });
            }}
          >
            View cart and checkout
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

/** A short note after an action, with an optional follow-up. */
export function ToastHost() {
  const { toast } = useShop();
  return (
    <div className="pointer-events-none fixed top-[6.75rem] right-4 z-50 w-[min(22rem,calc(100vw-2rem))]" aria-live="polite">
      {toast ? (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-float motion-safe:animate-pop"
        >
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.action ? (
            <button type="button" onClick={toast.action.onClick} className="shrink-0 font-bold text-accent underline-offset-2 hover:underline">
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
