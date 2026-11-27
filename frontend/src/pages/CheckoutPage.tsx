import { ArrowRight, Check, Hand, ShieldCheck, ShieldExclamationPoint, TriangleExclamationPoint } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import { CopyText } from "../components/CopyText";
import { Crumbs, PageTitle } from "../components/SiteChrome";
import { StoreMark } from "../components/StoreMark";
import { Button, Spinner } from "../components/ui";
import { formatSek } from "../lib/format";
import { hostMatchesDomain, hostnameOf } from "../lib/security";
import { navigate } from "../lib/router";
import { cartTotals, useShop, type CartLine } from "../state/ShopContext";
import { OrderSummary } from "./CartPage";

type PriceCheck = { status: "pending" } | { status: "same" } | { status: "changed"; price: number } | { status: "error"; message: string };

const STEPS = ["Review", "Confirm prices", "Buy at the stores"] as const;

function Steps({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Checkout steps">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const on = n === step;
        return (
          <li key={s} aria-current={on ? "step" : undefined} className="flex items-center gap-2.5 text-sm font-semibold">
            <span
              className={`grid size-7 place-items-center rounded-full border-2 text-xs ${
                done ? "border-safe bg-safe text-white" : on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-muted"
              }`}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : n}
            </span>
            <span className={done ? "text-safe" : on ? "text-ink" : "text-muted"}>{s}</span>
            {i < STEPS.length - 1 ? <span className="hidden h-0.5 w-10 bg-line sm:block" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Checkout hands off to the stores. blackbear never logs in, checks out or pays: it
 * re-checks each price in a fresh sandbox, then gives you each page address to open
 * yourself, as plain text.
 */
export function CheckoutPage() {
  const { cart } = useShop();
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState<Record<string, PriceCheck>>({});
  const t = cartTotals(cart);

  // Step 2: re-check every line for real, in parallel.
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setChecks(Object.fromEntries(cart.map((l) => [l.offerId, { status: "pending" } as PriceCheck])));
    for (const l of cart) {
      api
        .reverifyOffer(l.offerId)
        .then((r) => {
          if (cancelled) return;
          const unit = Math.round((r.price_sek ?? 0) * 100) / 100;
          setChecks((c) => ({ ...c, [l.offerId]: r.same_price ? { status: "same" } : { status: "changed", price: unit } }));
        })
        .catch((err: unknown) => {
          if (!cancelled) setChecks((c) => ({ ...c, [l.offerId]: { status: "error", message: errorMessage(err) } }));
        });
    }
    return () => {
      cancelled = true;
    };
    // Runs when entering step 2; the cart can't change on this page.
  }, [step]);

  if (cart.length === 0) {
    return (
      <>
        <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Cart", to: { name: "cart" } }, { label: "Checkout" }]} />
        <PageTitle>Checkout</PageTitle>
        <p className="text-sm text-muted">Your cart is empty.</p>
      </>
    );
  }

  const settled = cart.every((l) => checks[l.offerId] && checks[l.offerId]!.status !== "pending");
  const lineText = (lines: CartLine[]) => lines.map((l) => `${l.qty} × ${l.title}`).join(", ");

  return (
    <>
      <Crumbs trail={[{ label: "Home", to: { name: "home" } }, { label: "Cart", to: { name: "cart" } }, { label: "Checkout" }]} />
      <PageTitle>Checkout</PageTitle>
      <Steps step={step} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-2xl border bg-surface p-5 shadow-card sm:p-6" aria-live="polite">
          {step === 1 ? (
            <>
              <h2 className="text-lg font-bold">1 · Review</h2>
              <ul className="mt-3 divide-y">
                {[...t.byStore.entries()].map(([storeId, lines]) => (
                  <li key={storeId} className="flex items-center gap-3 py-3">
                    <StoreMark id={storeId} name={lines[0]!.storeName} size="sm" decorative />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{lines[0]!.storeName}</p>
                      <p className="truncate text-xs text-muted">{lineText(lines)}</p>
                    </div>
                    <b className="tabular-nums">{formatSek(lines.reduce((n, l) => n + l.unitItems * l.qty, 0))}</b>
                  </li>
                ))}
              </ul>
              <Button variant="ink" className="mt-4" onClick={() => setStep(2)}>
                Continue: confirm prices
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : step === 2 ? (
            <>
              <h2 className="text-lg font-bold">2 · Confirm prices</h2>
              <p className="mt-1 text-sm text-muted">Prices change. blackbear reads each one again in a fresh sandbox before you buy.</p>
              <ul className="mt-3 divide-y">
                {cart.map((l) => {
                  const c = checks[l.offerId];
                  return (
                    <li key={l.offerId} className="flex items-center gap-3 py-3 text-sm">
                      {!c || c.status === "pending" ? (
                        <Spinner className="size-4 text-muted" />
                      ) : c.status === "same" ? (
                        <Check className="size-4 text-safe" aria-hidden="true" />
                      ) : (
                        <TriangleExclamationPoint className="size-4 text-muted" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <b>{l.storeName}</b> <span className="text-muted">· {l.title}</span>
                      </span>
                      <span className={`shrink-0 ${c?.status === "same" ? "text-safe" : "text-muted"}`}>
                        {!c || c.status === "pending"
                          ? "re-checking…"
                          : c.status === "same"
                            ? "same price"
                            : c.status === "changed"
                              ? `now ${formatSek(c.price)} / st`
                              : "couldn't re-check"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Button variant="ink" className="mt-4" disabled={!settled} onClick={() => setStep(3)}>
                Continue
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold">3 · Buy at the stores</h2>
              <p className="mt-2 flex items-start gap-2 rounded-xl border-2 border-ink p-3 text-sm">
                <Hand className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  For your safety <b>blackbear never logs in, checks out or pays</b>. Copy each store's page address into your
                  browser and buy there.
                </span>
              </p>
              <ul className="mt-4 space-y-5">
                {[...t.byStore.entries()].map(([storeId, lines]) => {
                  const first = lines[0]!;
                  return (
                    <li key={storeId}>
                      <p className="flex items-center gap-2 font-semibold">
                        <StoreMark id={storeId} name={first.storeName} size="sm" decorative />
                        {first.storeName}
                      </p>
                      <p className="mt-0.5 mb-2 text-xs text-muted">{lineText(lines)}</p>
                      <ul className="space-y-2">
                        {lines.map((l) => {
                          const ok = first.storeDomain ? hostMatchesDomain(l.url, first.storeDomain) : false;
                          return (
                            <li key={l.offerId}>
                              <CopyText text={l.url} />
                              {first.storeDomain ? (
                                <p className={`mt-1 flex items-center gap-1.5 text-xs ${ok ? "text-safe" : "text-danger"}`}>
                                  {ok ? (
                                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                                  ) : (
                                    <ShieldExclamationPoint className="size-3.5" aria-hidden="true" />
                                  )}
                                  {ok
                                    ? `${hostnameOf(l.url)} is ${first.storeName}'s own site`
                                    : `${hostnameOf(l.url) ?? "Unknown host"} is not ${first.storeDomain}`}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
        <OrderSummary>
          {step > 1 ? (
            <Button variant="ghost" size="sm" onClick={() => (step === 3 ? setStep(2) : navigate({ name: "cart" }))}>
              Back
            </Button>
          ) : null}
        </OrderSummary>
      </div>
    </>
  );
}
