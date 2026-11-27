import { Check, FileImage, PackageX, RefreshCw, Trophy, Wallet } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { formatClock, formatRelative, formatSek } from "../lib/format";
import { useNow } from "../lib/useNow";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import { isHuntActive } from "../state/huntReducer";
import type { Offer } from "../types";
import { EvidenceModal } from "./EvidenceModal";
import { PromoChip } from "./PromoChip";
import { TrustBadge } from "./TrustBadge";
import { Button, card, Pill, Spinner } from "./ui";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

export function OfferCard({ offer, rank, provisional }: { offer: Offer; rank: number | null; provisional: boolean }) {
  const state = useHuntState();
  const { reverify, toggleCompare } = useHuntActions();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const compareHintId = useId();
  const now = useNow(true, 15_000);

  const store = state.config?.stores.find((s) => s.id === offer.store_id);
  const storeName = store?.name ?? offer.store_id;
  const memberships = state.request?.memberships ?? [];
  const budget = state.request?.budget_sek ?? null;
  const running = isHuntActive(state.phase);
  const rv = state.reverify[offer.id];
  const checked = state.compare.includes(offer.id);
  const compareDisabled = !checked && state.compare.length >= 2;
  const isBest = rank === 1 && !provisional;
  const qty = offer.quantity;
  const shipping = offer.shipping_sek;
  const overBudget = budget != null && offer.effective_total_sek > budget;

  return (
    <article
      aria-labelledby={titleId}
      className={`${card} p-4 motion-safe:animate-rise sm:p-5 ${isBest ? "border-line-strong" : ""}`}
    >
      {/* Title row */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          className={`grid h-7 min-w-7 place-items-center rounded-md border px-1.5 font-mono text-xs tabular-nums ${
            isBest ? "border-ink/60 bg-raised text-ink shadow-key" : "bg-well text-muted inset-shadow-well"
          }`}
          aria-label={rank === null ? "Unranked" : `Rank ${rank}`}
        >
          {rank === null ? "–" : `#${rank}`}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="font-medium text-ink/90">{storeName}</span>
            {offer.model_number ? <span className="font-mono">{offer.model_number}</span> : null}
            {isBest ? (
              <span className="inline-flex items-center gap-1 text-ink">
                <Trophy className="size-3.5" aria-hidden="true" />
                Best deal
              </span>
            ) : null}
            {rank === null && !provisional ? (
              <span className="text-muted">
                Not ranked · {offer.unranked_reason ?? (offer.shipping_sek === null ? "shipping not shown" : "excluded")}
              </span>
            ) : null}
          </p>
          <h3 id={titleId} className="mt-0.5 text-base leading-snug font-semibold break-words">
            {offer.title}
          </h3>
        </div>
        <TrustBadge trust={offer.trust} pending={running} />
      </div>

      {/* Prices */}
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-end">
        <div>
          <p className="text-xs text-muted">
            {shipping === null ? "Item subtotal" : "Effective total"} · {qty} {qty === 1 ? "unit" : "units"}
            {shipping !== null ? ", shipping incl." : ""}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{formatSek(offer.effective_total_sek)}</p>
          <p className="mt-0.5 text-sm text-muted tabular-nums">{formatSek(offer.effective_unit_sek)} per unit</p>
          {overBudget ? (
            <Pill as="p" tone="strong" shape="tag" icon={Wallet} className="mt-2">
              Over budget by {shipping === null ? "at least " : ""}{formatSek(offer.effective_total_sek - (budget as number))}
            </Pill>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Detail label="Sale price">{formatSek(offer.price_sek)}</Detail>
          <Detail label="Previous price">
            {offer.previous_price_sek != null ? (
              <s className="text-muted decoration-muted">{formatSek(offer.previous_price_sek)}</s>
            ) : (
              <span className="text-muted">none shown</span>
            )}
          </Detail>
          <Detail label="30-day lowest">
            {offer.lowest_30d_price_sek != null ? (
              formatSek(offer.lowest_30d_price_sek)
            ) : (
              <span className="text-muted">no history</span>
            )}
          </Detail>
          <Detail label="Shipping">{shipping === null ? "Unknown" : shipping === 0 ? "Free" : formatSek(shipping)}</Detail>
        </dl>
      </div>

      {/* Promos */}
      {offer.promos.length ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Promotions">
          {offer.promos.map((p, i) => (
            <PromoChip key={`${p.type}-${i}`} promo={p} memberships={memberships} />
          ))}
        </ul>
      ) : null}

      {/* Footer: provenance + actions */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-3">
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted">
          <span>
            Captured <time dateTime={offer.captured_at}>{formatClock(offer.captured_at)}</time>
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatRelative(offer.captured_at, now)}</span>
          {!offer.in_stock ? (
            <span className="inline-flex items-center gap-1 text-ink">
              <PackageX className="size-3.5" aria-hidden="true" /> out of stock
            </span>
          ) : null}
        </p>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button
            ref={evidenceBtn}
            size="sm"
            icon={FileImage}
            onClick={() => setEvidenceOpen(true)}
            aria-haspopup="dialog"
          >
            Evidence
          </Button>
          <Button
            size="sm"
            icon={RefreshCw}
            loading={rv?.status === "pending"}
            onClick={() => void reverify(offer.id)}
          >
            {rv?.status === "pending" ? "Re-verifying…" : "Re-verify"}
          </Button>
          {/*
            A checkbox that sits level with the buttons beside it; checked, it stays pressed in.
            Written out here because a <label> is never `:enabled`, which the Button styles key on.
          */}
          <label
            className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium select-none transition duration-150 ease-press ${
              checked
                ? "border-ink/60 bg-well shadow-key-pressed"
                : "border-line-strong bg-raised bg-linear-to-b from-ink/7 to-transparent shadow-key"
            } ${
              compareDisabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:border-muted/60 active:translate-y-px active:shadow-key-pressed"
            }`}
            title={compareDisabled ? "Two offers are already selected. Uncheck one first." : undefined}
          >
            <span className="relative grid size-4 place-items-center">
              <input
                type="checkbox"
                checked={checked}
                disabled={compareDisabled}
                onChange={() => toggleCompare(offer.id)}
                aria-describedby={compareDisabled ? compareHintId : undefined}
                className="peer size-4 cursor-pointer appearance-none rounded border border-line-strong bg-well inset-shadow-well checked:border-ink checked:bg-ink disabled:cursor-not-allowed"
              />
              <Check
                className="pointer-events-none absolute size-3 text-canvas opacity-0 peer-checked:opacity-100"
                strokeWidth={3}
                aria-hidden="true"
              />
            </span>
            Compare
          </label>
          {compareDisabled ? (
            <span id={compareHintId} className="sr-only">
              Two offers are already selected for comparison. Uncheck one first.
            </span>
          ) : null}
        </div>
      </div>

      {/* Re-verify result */}
      <div aria-live="polite" className="empty:hidden">
        {rv?.status === "pending" ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Spinner /> Re-checking the price in a fresh sandbox…
          </p>
        ) : rv?.status === "same" ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm">
            <Check className="size-4" aria-hidden="true" />
            <span className="font-medium">Same price ✓</span>
            <span className="font-mono text-xs text-muted">checked {formatClock(rv.at)}</span>
          </p>
        ) : rv?.status === "changed" ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm">
            <RefreshCw className="size-4" aria-hidden="true" />
            <span className="font-medium tabular-nums">
              New price: {formatSek(rv.price)} <span className="text-muted">(was {formatSek(rv.previous)})</span>
            </span>
            <span className="font-mono text-xs text-muted">checked {formatClock(rv.at)}</span>
            <span className="basis-full text-xs text-muted">
              The effective total above is from the first capture. Start the hunt again to re-rank on the new price.
            </span>
          </p>
        ) : rv?.status === "error" ? (
          <p className="mt-3 text-sm text-ink">Re-verify failed: {rv.message}</p>
        ) : null}
      </div>

      {evidenceOpen ? (
        <EvidenceModal
          offer={offer}
          store={store}
          onClose={() => {
            setEvidenceOpen(false);
            evidenceBtn.current?.focus();
          }}
        />
      ) : null}
    </article>
  );
}
