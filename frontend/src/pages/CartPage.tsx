import { ArrowLeft, ArrowRight, ShoppingCart, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { QtyStepper } from "../components/CartControl";
import { ProductPhoto } from "../components/ProductPhoto";
import { Crumbs, PageTitle } from "../components/SiteChrome";
import { StoreMark } from "../components/StoreMark";
import { TRUST } from "../components/trust";
import { Button, EmptyState, Pill } from "../components/ui";
import { formatSek } from "../lib/format";
import { href, navigate } from "../lib/router";
import { useHuntState } from "../state/HuntContext";
import { cartTotals, useShop, type CartLine } from "../state/ShopContext";

/** The summary next to the cart and the checkout. */
export function OrderSummary({ children }: { children?: ReactNode }) {
  const { cart } = useShop();
  const t = cartTotals(cart);
  return (
    <aside aria-label="Order summary" className="rounded-2xl border bg-surface p-5 shadow-card lg:sticky lg:top-24">
      <h2 className="text-base font-bold">Order summary</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Items</dt>
          <dd className="tabular-nums">{formatSek(t.items)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Delivery</dt>
          <dd className="text-right tabular-nums">
            {formatSek(t.shipping)}
            {t.unknownShipping ? (
              <span className="block text-xs text-muted">
                + {t.unknownShipping} {t.unknownShipping === 1 ? "store" : "stores"} not shown
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t pt-2.5">
          <dt className="font-bold">Estimated total</dt>
          <dd className="text-xl font-extrabold tabular-nums">{formatSek(t.items + t.shipping)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        {t.byStore.size} {t.byStore.size === 1 ? "store" : "stores"}: you pay each store yourself.
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </aside>
  );
}

function Line({ line }: { line: CartLine }) {
  const { setQty, removeLine } = useShop();
  const { offers } = useHuntState();
  const live = Boolean(offers[line.offerId]);
  const t = TRUST[line.trust];
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] sm:items-center">
      <ProductPhoto src={line.imageUrl} alt="" storeId={line.storeId} storeName={line.storeName} className="aspect-square" pad="p-1.5" />
      <div className="min-w-0">
        {live ? (
          <a href={href({ name: "offer", id: line.offerId })} className="line-clamp-2 text-sm font-semibold hover:underline">
            {line.title}
          </a>
        ) : (
          <p className="line-clamp-2 text-sm font-semibold">{line.title}</p>
        )}
        <p className="mt-1 flex flex-wrap gap-1.5">
          <Pill size="xs" tone={t.tone} icon={t.icon}>
            {t.short}
          </Pill>
          {line.promo ? (
            <Pill size="xs" tone="strong">
              {line.promo}
            </Pill>
          ) : null}
        </p>
      </div>
      <div className="col-start-2 flex items-center sm:col-start-auto">
        <QtyStepper value={line.qty} min={1} label={line.title} onChange={(n) => setQty(line.offerId, n)} />
        <Button variant="ghost" size="sm" iconOnly icon={Trash2} aria-label={`Remove ${line.title}`} className="ml-1" onClick={() => removeLine(line.offerId)} />
      </div>
      <p className="col-start-2 text-right font-bold tabular-nums sm:col-start-auto sm:min-w-24">{formatSek(line.unitItems * line.qty)}</p>
    </li>
  );
}

/** The cart: a shortlist grouped by store. Nothing is bought here. */
export function CartPage() {
  const { cart } = useShop();
  const t = cartTotals(cart);
  return (
    <>
      <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Cart" }]} />
      <PageTitle sub="Your blackbear cart is a shortlist. Nothing is bought until you continue at each store.">Your cart</PageTitle>
      {cart.length === 0 ? (
        <>
          <EmptyState icon={ShoppingCart}>Your cart is empty. Add offers from the results.</EmptyState>
          <div className="mt-4 flex justify-center">
            <Button variant="ink" icon={ArrowLeft} onClick={() => navigate({ name: "results" })}>
              Browse results
            </Button>
          </div>
        </>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            {[...t.byStore.entries()].map(([storeId, lines]) => {
              const first = lines[0]!;
              return (
                <section key={storeId} aria-label={first.storeName} className="overflow-hidden rounded-2xl border bg-surface shadow-card">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-raised/60 px-4 py-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <StoreMark id={storeId} name={first.storeName} size="sm" decorative />
                      {first.storeName}
                    </span>
                    <span className="text-xs text-muted">
                      Delivery: {first.shipping == null ? "shown at the store" : first.shipping === 0 ? "free" : formatSek(first.shipping)}
                    </span>
                  </header>
                  <ul className="divide-y">
                    {lines.map((l) => (
                      <Line key={l.offerId} line={l} />
                    ))}
                  </ul>
                </section>
              );
            })}
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate({ name: "results" })}>
              Keep shopping
            </Button>
          </div>
          <OrderSummary>
            <Button variant="primary" size="lg" className="w-full" onClick={() => navigate({ name: "checkout" })}>
              Checkout
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </OrderSummary>
        </div>
      )}
    </>
  );
}
