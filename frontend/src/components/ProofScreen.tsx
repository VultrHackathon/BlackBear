import { ImageOff } from "lucide-react";

/**
 * A screenshot the agent took, shown on a small dark screen: the product "photo"
 * of every offer is its proof. `src` must already be checked with safeImageSrc.
 */
export function ProofScreen({
  src,
  alt,
  large = false,
  className = "",
}: {
  src: string | null;
  alt: string;
  large?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`theme-dark relative bg-linear-to-b from-line-strong to-line ${
        large ? "rounded-2xl p-1" : "rounded-xl p-[3px]"
      } shadow-[0_22px_36px_-20px_rgb(0_0_0/0.6),0_2px_4px_rgb(0_0_0/0.15)] ${className}`}
    >
      <div
        className={`glass-sheen relative aspect-[16/10] overflow-hidden bg-well ${
          large ? "rounded-[0.8rem]" : "rounded-[0.55rem]"
        }`}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            className="size-full object-cover object-top transition duration-500 ease-glide group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-2xs text-muted">
            <ImageOff className="size-4" aria-hidden="true" />
            No trusted screenshot
          </div>
        )}
      </div>
    </div>
  );
}
