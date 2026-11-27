import { Copy, CopyCheck, ImageOff, ShieldCheck, ShieldExclamationPoint, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { formatDateTime, formatRelative, formatSek } from "../lib/format";
import { hostMatchesDomain, hostnameOf, safeImageSrc } from "../lib/security";
import type { Offer, StoreConfig } from "../types";
import { btnGhost, btnSecondary } from "./ui";

/**
 * Evidence for one offer: the screenshot, the page URL as PLAIN TEXT (never a link,
 * because store content is hostile), and when it was captured. Uses a native modal
 * <dialog>: focus is trapped, Escape closes, the page behind is inert.
 */
export function EvidenceModal({
  offer,
  store,
  onClose,
}: {
  offer: Offer;
  store: StoreConfig | undefined;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // No close() in a cleanup: unmounting removes the dialog from the top layer anyway,
    // and a close() here would fire onClose during StrictMode's effect re-run.
  }, []);

  const close = () => ref.current?.close();

  const src = safeImageSrc(offer.screenshot_url);
  const host = hostnameOf(offer.url);
  const domain = store?.domain;
  const hostOk = domain ? hostMatchesDomain(offer.url, domain) : false;
  const storeName = store?.name ?? offer.store_id;

  const copyUrl = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(offer.url);
      ok = true;
    } catch {
      // Fallback inside the dialog (the rest of the page is inert while it's open).
      const dialog = ref.current;
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
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (the dialog box itself, outside the content) closes.
        if (e.target === e.currentTarget) close();
      }}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[min(60rem,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs text-muted">Evidence · {storeName}</p>
            <h2 id={titleId} className="mt-0.5 text-base font-semibold break-words">
              {offer.title}
            </h2>
          </div>
          <button type="button" onClick={close} className={`${btnGhost} -mr-1 p-2`} aria-label="Close evidence">
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          <figure>
            <div className="overflow-hidden rounded-lg border border-line bg-canvas">
              {src ? (
                <img
                  src={src}
                  alt={`Screenshot of the ${storeName} page taken by its sandbox`}
                  className="block h-auto w-full"
                  referrerPolicy="no-referrer"
                  draggable={false}
                />
              ) : (
                <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted">
                  <ImageOff className="size-5" aria-hidden="true" />
                  Screenshot not loaded: it doesn't come from the blackbear API or a data: URL.
                </div>
              )}
            </div>
            <figcaption className="mt-2 text-xs text-muted">
              Captured by the {storeName} sandbox. This is what the agent saw when it read the price.
            </figcaption>
          </figure>

          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="text-muted">Page URL</dt>
            <dd className="min-w-0 space-y-2">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2.5 py-2 font-mono text-xs break-all select-all">
                  {offer.url || "–"}
                </p>
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className={`${btnSecondary} shrink-0 px-2.5 py-1.5 text-xs`}
                  disabled={!offer.url}
                >
                  {copy === "copied" ? (
                    <CopyCheck className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                  {copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy"}
                </button>
              </div>
              <span className="sr-only" aria-live="polite">
                {copy === "copied" ? "URL copied to clipboard" : copy === "failed" ? "Copy failed" : ""}
              </span>
              {domain ? (
                hostOk ? (
                  <p className="flex items-center gap-1.5 text-xs text-safe">
                    <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                    Host {host} matches this sandbox's allowlist ({domain}).
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-danger">
                    <ShieldExclamationPoint className="size-3.5 shrink-0" aria-hidden="true" />
                    Host {host ?? "unknown"} is outside this sandbox's allowlist ({domain}).
                  </p>
                )
              ) : null}
              <p className="text-xs text-muted">
                Shown as plain text on purpose. Store pages are untrusted, so blackbear never turns them into
                clickable links. Copy it and check it yourself.
              </p>
            </dd>

            <dt className="text-muted">Captured at</dt>
            <dd className="font-mono text-xs">
              <time dateTime={offer.captured_at}>{formatDateTime(offer.captured_at)}</time>
              <span className="ml-2 font-sans text-muted">({formatRelative(offer.captured_at, Date.now())})</span>
            </dd>

            <dt className="text-muted">Price on capture</dt>
            <dd className="tabular-nums">
              {formatSek(offer.price_sek)}
              <span className="text-muted">
                {" "}
                · {offer.shipping_sek === null ? "item subtotal" : "effective total"} {formatSek(offer.effective_total_sek)} for {offer.quantity}
              </span>
            </dd>

            <dt className="text-muted">Offer ID</dt>
            <dd className="font-mono text-xs break-all text-muted">{offer.id}</dd>
          </dl>
        </div>
      </div>
    </dialog>
  );
}
