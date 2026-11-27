import { Package } from "lucide-react";
import { useState } from "react";
import { safeImageSrc } from "../lib/security";
import { StoreMark } from "./StoreMark";

/**
 * The product itself, on white. Only an `image_url` from our own origin (or data:) is
 * shown. Without one, a neutral placeholder: a page screenshot never stands in for the
 * product, screenshots are proof and live on the product page.
 */
export function ProductPhoto({
  src,
  alt,
  storeId,
  storeName,
  className = "aspect-[4/3]",
  pad = "p-[8%]",
}: {
  src: string | undefined;
  alt: string;
  storeId: string;
  storeName: string;
  className?: string;
  pad?: string;
}) {
  const safe = safeImageSrc(src);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative grid place-items-center overflow-hidden rounded-xl border bg-white ${pad} ${className}`}>
      {safe && !failed ? (
        <img
          src={safe}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="max-h-full max-w-full object-contain transition duration-500 ease-glide group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-center text-xs text-muted">
          <span className="relative">
            <Package className="size-10 stroke-[1.25] text-line-strong" aria-hidden="true" />
            <StoreMark id={storeId} name={storeName} size="xs" decorative className="absolute -right-2 -bottom-1" />
          </span>
          <span>No product photo</span>
        </div>
      )}
    </div>
  );
}
