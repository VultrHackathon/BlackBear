/** The blackbear mark: a "b" with the yellow accent dot. Decorative. */
export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#141414" />
      <path d="M10.5 7.5V23" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="15.25" cy="18.25" r="4.75" fill="none" stroke="#ffffff" strokeWidth="2.6" />
      <circle cx="23.5" cy="9.5" r="2.75" fill="#ffc21a" />
    </svg>
  );
}
