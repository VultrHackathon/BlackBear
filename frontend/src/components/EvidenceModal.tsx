import { Check, Copy, CopyCheck, RefreshCw, ShieldCheck, ShieldExclamationPoint } from "lucide-react";
import { useRef, useState } from "react";
import { shownPrice } from "../lib/deals";
import { formatClock, formatDateTime, formatSek } from "../lib/format";
import { hostMatchesDomain, hostnameOf, safeImageSrc } from "../lib/security";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import type { Offer, StoreConfig } from "../types";
import { Modal } from "./Modal";
import { PromoChip } from "./PromoChip";
import { ProofScreen } from "./ProofScreen";
import { StoreMark } from "./StoreMark";
import { TRUST } from "./trust";
import { Button, Pill, Spinner } from "./ui";

/**
 * The product view: the screenshot the agent took, the price it read, the auditor's
 * verdict, and the page URL as PLAIN TEXT (never a link: store content is hostile).
 */
export function EvidenceModal({
  offer,
  store,
  includeDelivery,
  onClose,
}: {
  offer: Offer;
  store: StoreConfig | undefined;
  includeDelivery: boolean;
  onClose: () => void;
}) {
  const state = useHuntState();
  const { reverify } = useHuntActions();
  // Inside the dialog, so it stays focusable while the rest of the page is inert.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  const src = safeImageSrc(offer.screenshot_url);
  const host = hostnameOf(offer.url);
  const domain = store?.domain;
  const hostOk = domain ? hostMatchesDomain(offer.url, domain) : false;
  const storeName = store?.name ?? offer.store_id;
  const trust = TRUST[offer.trust?.label ?? "unknown"];
  const rv = state.reverify[offer.id];
  const memberships = state.request?.memberships ?? [];

  const copyUrl = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(offer.url);
      ok = true;
    } catch {
      // Fallback inside the dialog (the rest of the page is inert while it's open).
      const dialog = bodyRef.current;
      if (dialog) {
        const ta = document.createElement("textarea");
        ta.value = offer.url;
        ta.setAttribute("readonly", "");
        ta.className = "fixed top-0 left-0 opacity-0";
        dialog.appendChild(ta);
        ta.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        dialog.removeChild(ta);
      }
    }
    setCopy(ok ? "copied" : "failed");
    window.setTimeout(() => setCopy("idle"), 2000);
  };

  return (
    <Modal
      wide
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <StoreMark id={offer.store_id} name={storeName} size="xs" decorative />
          {storeName}
        </span>
      }
      title={offer.title}
      closeLabel="Close product"
      onClose={onClose}
    >
      <div ref={bodyRef} className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <figure className="min-w-0">
          <div className="rounded-2xl bg-raised p-4 sm:p-6">
            <ProofScreen large src={src} alt={`Screenshot of the ${storeName} page taken by its sandbox`} />
          </div>
          <figcaption className="mt-2 text-xs text-muted">
            What the agent saw when it read the price
            {offer.captured_at ? (
              <>
                {" · "}
                <time dateTime={offer.captured_at}>{formatDateTime(offer.captured_at)}</time>
              </>
            ) : null}
          </figcaption>
        </figure>

        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-4xl font-extrabold tracking-[-0.03em] tabular-nums">
              {formatSek(shownPrice(offer, includeDelivery))}
            </p>
            <p className="mt-1 text-sm text-muted">
              {offer.shipping_sek === 0
                ? "Free delivery"
                : includeDelivery
                  ? `incl. ${formatSek(offer.shipping_sek)} delivery`
                  : `+ ${formatSek(offer.shipping_sek)} delivery`}
              {offer.quantity > 1 ? ` · for ${offer.quantity}` : ""}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <div className="flex gap-1.5">
                <dt className="text-muted">Sale</dt>
                <dd className="tabular-nums">{formatSek(offer.price_sek)}</dd>
              </div>
              {offer.previous_price_sek != null ? (
                <div className="flex gap-1.5">
                  <dt className="text-muted">Before</dt>
                  <dd className="tabular-nums">
                    <s className="decoration-muted">{formatSek(offer.previous_price_sek)}</s>
                  </dd>
                </div>
              ) : null}
              {offer.lowest_30d_price_sek != null ? (
                <div className="flex gap-1.5">
                  <dt className="text-muted">30-day low</dt>
                  <dd className="tabular-nums">{formatSek(offer.lowest_30d_price_sek)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <section aria-label="Trust verdict" className="rounded-2xl border p-4">
            <Pill tone={trust.tone} icon={trust.icon}>
              {trust.heading}
            </Pill>
            {offer.trust?.reasons.length ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {offer.trust.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                    <span className="min-w-0 break-words">{r}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {offer.promos.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Promotions">
              {offer.promos.map((p, i) => (
                <PromoChip key={`${p.type}-${i}`} promo={p} memberships={memberships} />
              ))}
            </ul>
          ) : null}

          <div>
            <p className="text-xs text-muted">Page address (plain text, never a link)</p>
            <div className="mt-1 flex items-start gap-2">
              <p className="min-w-0 flex-1 rounded-lg border bg-well px-2.5 py-2 font-mono text-xs break-all select-all inset-shadow-well">
                {offer.url || "–"}
              </p>
              <Button size="sm" icon={copy === "copied" ? CopyCheck : Copy} onClick={() => void copyUrl()} disabled={!offer.url}>
                {copy === "copied" ? "Copied" : copy === "failed" ? "Failed" : "Copy"}
              </Button>
            </div>
            <span className="sr-only" aria-live="polite">
              {copy === "copied" ? "Address copied" : copy === "failed" ? "Copy failed" : ""}
            </span>
            {domain ? (
              hostOk ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-safe">
                  <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  {host} is this store's own site
                </p>
              ) : (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-danger">
                  <ShieldExclamationPoint className="size-3.5 shrink-0" aria-hidden="true" />
                  {host ?? "Unknown host"} is not {domain}
                </p>
              )
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button
              variant="ink"
              icon={RefreshCw}
              loading={rv?.status === "pending"}
              onClick={() => void reverify(offer.id)}
            >
              {rv?.status === "pending" ? "Checking…" : "Check the price again"}
            </Button>
            <p className="min-w-0 text-sm" aria-live="polite">
              {rv?.status === "pending" ? (
                <span className="inline-flex items-center gap-2 text-muted">
                  <Spinner /> In a fresh sandbox
                </span>
              ) : rv?.status === "same" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4" aria-hidden="true" /> Same price
                  <span className="font-mono text-xs text-muted">{formatClock(rv.at)}</span>
                </span>
              ) : rv?.status === "changed" ? (
                <span className="tabular-nums">
                  Now {formatSek(rv.price)} <span className="text-muted">(was {formatSek(rv.previous)})</span>
                </span>
              ) : rv?.status === "error" ? (
                <span>Couldn't check: {rv.message}</span>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
