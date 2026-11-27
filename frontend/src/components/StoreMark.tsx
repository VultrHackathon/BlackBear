import { brandOf, markOf } from "../lib/brands";

const SIZES = {
  xs: "size-5 rounded-md text-[0.55rem]",
  sm: "size-7 rounded-lg text-[0.7rem]",
  md: "size-10 rounded-xl text-sm",
  lg: "size-12 rounded-2xl text-base",
} as const;

/**
 * A store's mark: its initials on its brand colour. Named for assistive tech unless
 * `decorative`, for when the store name is already written next to it.
 */
export function StoreMark({
  id,
  name,
  size = "sm",
  decorative = false,
  className = "",
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
  decorative?: boolean;
  className?: string;
}) {
  const brand = brandOf(id);
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : name}
      style={{ backgroundColor: brand.color, color: brand.ink }}
      className={`inline-grid shrink-0 place-items-center leading-none font-bold tracking-tight shadow-[inset_0_1px_0_rgb(255_255_255/0.22),inset_0_-1px_0_rgb(0_0_0/0.18),0_1px_2px_rgb(0_0_0/0.18)] select-none ${SIZES[size]} ${className}`}
    >
      {markOf(id, name)}
    </span>
  );
}
