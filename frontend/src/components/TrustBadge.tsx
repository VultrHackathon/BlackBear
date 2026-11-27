import { CircleQuestionMark, ShieldCheck, ShieldX, TriangleExclamationPoint, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { TRUST_LABELS } from "../lib/labels";
import type { Trust, TrustLabel } from "../types";
import { Spinner } from "./ui";

const STYLES: Record<TrustLabel, { icon: LucideIcon; className: string; text: string; heading: string }> = {
  real: {
    icon: ShieldCheck,
    className: "border-safe/40 bg-safe/10 text-safe",
    text: "text-safe",
    heading: "Real deal: the auditor checked it",
  },
  questionable: {
    icon: TriangleExclamationPoint,
    className: "border-caution/40 bg-caution/10 text-caution",
    text: "text-caution",
    heading: "Questionable: read before you buy",
  },
  fake: {
    icon: ShieldX,
    className: "border-danger/40 bg-danger/10 text-danger",
    text: "text-danger",
    heading: "Fake deal: the discount doesn't hold up",
  },
  unknown: {
    icon: CircleQuestionMark,
    className: "border-line-strong bg-raised text-muted",
    text: "text-muted",
    heading: "Unknown: not enough evidence",
  },
};

/**
 * Trust label with its reasons. Reasons open on hover, and toggle on click/tap or
 * Enter/Space; Escape or a click outside closes them.
 */
export function TrustBadge({ trust, pending }: { trust: Trust | undefined; pending: boolean }) {
  const label: TrustLabel = trust?.label ?? "unknown";
  const auditing = !trust && pending;
  const style = STYLES[label];
  const Icon = style.icon;
  const reasons = trust?.reasons.length
    ? trust.reasons
    : [auditing ? "The auditor is still checking this offer." : "The auditor returned no reasons."];

  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setPinned(false);
          setHover(false);
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setPinned((p) => !p)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${style.className}`}
      >
        {auditing ? <Spinner className="size-3.5" /> : <Icon className="size-3.5" aria-hidden="true" />}
        {auditing ? "Auditing…" : TRUST_LABELS[label]}
        <span className="sr-only">: trust verdict, show reasons</span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-line-strong bg-raised p-3 text-left shadow-2xl shadow-black/50"
      >
        <p className={`text-xs font-semibold ${auditing ? "text-muted" : style.text}`}>
          {auditing ? "Auditor is checking…" : style.heading}
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-ink">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden="true" />
              <span className="min-w-0 break-words">{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
