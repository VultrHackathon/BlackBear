import { ArrowRight, ImageOff, Receipt } from "lucide-react";
import { deliveryNote, shippingKnown } from "../lib/deals";
import { formatDateTime, formatSek } from "../lib/format";
import { href } from "../lib/router";
import { safeImageSrc } from "../lib/security";
import type { Offer, StoreConfig } from "../types";
import { Modal } from "./Modal";
import { StoreMark } from "./StoreMark";

/**
 * Proof for one offer: the screenshot the agent took of the store's cart when it
 * read the price. Opened from the product photo.
 */
export function CartProof({
  offer,
  store,
  onClose,
}: {
  offer: Offer;
  store: StoreConfig | undefined;
  onClose: () => void;
}) {
  const name = store?.name ?? offer.store_id;
  const src = safeImageSrc(offer.screenshot_url);
  return (
    <Modal
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <StoreMark id={offer.store_id} name={name} size="xs" decorative />
          {name}
        </span>
      }
      title={
        <span className="inline-flex items-center gap-2">
          <Receipt className="size-4 text-muted" aria-hidden="true" />
          In the cart
        </span>
      }
      closeLabel="Close cart proof"
      onClose={onClose}
    >
      <figure>
        {src ? (
          <img
            src={src}
            alt={`The ${name} cart, screenshot taken by its sandbox`}
            draggable={false}
            referrerPolicy="no-referrer"
            className="block h-auto w-full rounded-xl border"
          />
        ) : (
          <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-xl border bg-raised text-sm text-muted">
            <ImageOff className="size-5" aria-hidden="true" />
            No trusted cart screenshot for this offer.
          </div>
        )}
        <figcaption className="mt-2 text-xs text-muted">
          Taken inside {name}'s sandbox when the agent read the cart
          {offer.captured_at ? (
            <>
              {" · "}
              <time dateTime={offer.captured_at}>{formatDateTime(offer.captured_at)}</time>
            </>
          ) : null}
        </figcaption>
      </figure>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm">
          <span className="text-muted">{shippingKnown(offer) ? "You pay " : "Items "}</span>
          <b className="text-lg tabular-nums">{formatSek(offer.effective_total_sek)}</b>
          <span className="text-muted"> · {deliveryNote(offer, true, formatSek)}</span>
        </p>
        <a
          href={href({ name: "offer", id: offer.id })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-semibold text-white shadow-ink transition hover:bg-ink/90"
        >
          Product page
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      </div>
    </Modal>
  );
}
