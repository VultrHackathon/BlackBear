import { Check, CircleX, LoaderCircle, type LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

/* ---------- Surfaces ---------- */

/**
 * A raised panel. The border colour is left to the base layer (`line`) so a caller
 * can add `border-line-strong` without fighting a colour class in here.
 */
export const card = "rounded-2xl border bg-surface bg-linear-to-b from-ink/3 to-transparent to-50% shadow-card";

/** A recessed panel inside a card: readouts, log entries, quoted agent text. */
export const well = "rounded-xl border bg-canvas/50 inset-shadow-well";

/* ---------- Buttons ---------- */

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const BUTTON_BASE =
  "relative inline-flex shrink-0 items-center justify-center border whitespace-nowrap select-none transition duration-150 ease-press enabled:active:translate-y-px enabled:active:duration-75 disabled:opacity-50 disabled:shadow-none";

/** Primary = the single lime accent. Use it for the main action of a section only. */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border-black/25 bg-accent bg-linear-to-b from-accent-hover to-accent bg-origin-border font-semibold text-on-accent shadow-accent enabled:hover:to-accent-hover enabled:hover:shadow-accent-hover enabled:active:from-accent enabled:active:to-accent enabled:active:shadow-accent-pressed",
  secondary:
    "border-line-strong bg-raised bg-linear-to-b from-ink/7 to-transparent font-medium text-ink shadow-key enabled:hover:border-muted/60 enabled:hover:from-ink/12 enabled:hover:shadow-key-hover enabled:active:bg-surface enabled:active:from-transparent enabled:active:shadow-key-pressed",
  ghost:
    "border-transparent font-medium text-muted enabled:hover:bg-raised enabled:hover:text-ink enabled:active:bg-line",
};

/** Fixed heights, so buttons of one size always line up: 28 / 32 / 40 / 44 px. */
const BUTTON_SIZE: Record<ButtonSize, { box: string; pad: string; square: string; icon: string }> = {
  xs: { box: "h-7 gap-1.5 rounded-md text-xs", pad: "px-2.5", square: "w-7", icon: "size-3.5" },
  sm: { box: "h-8 gap-1.5 rounded-lg text-sm", pad: "px-3", square: "w-8", icon: "size-4" },
  md: { box: "h-10 gap-2 rounded-lg text-sm", pad: "px-4", square: "w-10", icon: "size-4" },
  lg: { box: "h-11 gap-2 rounded-lg text-sm", pad: "px-5", square: "w-11", icon: "size-4" },
};

/** Small controls get a taller invisible hit area on touch screens. */
const HIT_SLOP =
  "pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1.5";

function buttonStyles({
  variant = "secondary",
  size = "md",
  iconOnly = false,
}: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean } = {}): string {
  const s = BUTTON_SIZE[size];
  const slop = size === "xs" || size === "sm" ? HIT_SLOP : "";
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${s.box} ${iconOnly ? s.square : s.pad} ${slop}`;
}

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit";
  /** Leading icon. Replaced by a spinner while `loading`. */
  icon?: LucideIcon;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
};

/** An icon-only button has no text, so it must be named. */
export type ButtonProps = ButtonBaseProps & ({ iconOnly?: false } | { iconOnly: true; "aria-label": string });

/**
 * `className` is for layout only (margins, width). Size and colour come from the
 * props: utility classes appended here would not reliably override the built-in ones.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    type = "button",
    icon: Icon,
    iconOnly = false,
    loading = false,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const iconSize = BUTTON_SIZE[size].icon;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonStyles({ variant, size, iconOnly })} ${className}`}
      {...rest}
    >
      {loading ? (
        <Spinner className={iconSize} />
      ) : Icon ? (
        <Icon className={`${iconSize} shrink-0`} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

/* ---------- Pills ---------- */

export type PillTone = "neutral" | "strong" | "safe" | "caution" | "danger";
export type PillSize = "xs" | "sm";

/** Green / amber / red are for trust and security only; everything else is neutral or strong. */
const PILL_TONE: Record<PillTone, string> = {
  neutral: "text-muted",
  strong: "border-line-strong bg-raised text-ink",
  safe: "border-safe/40 bg-safe/10 text-safe",
  caution: "border-caution/40 bg-caution/10 text-caution",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

const PILL_SIZE: Record<PillSize, { box: string; icon: string }> = {
  xs: { box: "h-5 gap-1 px-1.5 text-2xs", icon: "size-3" },
  sm: { box: "h-6 gap-1.5 px-2.5 text-xs", icon: "size-3.5" },
};

export function pillStyles({
  tone = "neutral",
  size = "sm",
  shape = "round",
  mono = false,
}: { tone?: PillTone; size?: PillSize; shape?: "round" | "tag"; mono?: boolean } = {}): string {
  return `inline-flex max-w-full min-w-0 shrink-0 items-center border ${PILL_TONE[tone]} ${PILL_SIZE[size].box} ${
    shape === "tag" ? "rounded-md" : "rounded-full"
  } ${mono ? "font-mono" : ""}`;
}

export function Pill({
  tone,
  size = "sm",
  shape,
  mono,
  icon: Icon,
  as: Tag = "span",
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  tone?: PillTone;
  size?: PillSize;
  shape?: "round" | "tag";
  mono?: boolean;
  icon?: LucideIcon;
  as?: "span" | "li" | "p";
}) {
  return (
    <Tag className={`${pillStyles({ tone, size, shape, mono })} ${className}`} {...rest}>
      {Icon ? <Icon className={`${PILL_SIZE[size].icon} shrink-0`} aria-hidden="true" /> : null}
      {children}
    </Tag>
  );
}

/* ---------- Status light ---------- */

export type LedState = "off" | "dim" | "live" | "on" | "danger";

/**
 * A small status light. Decorative: it never carries meaning on its own, the
 * status word next to it does. `live` breathes; under reduced motion it is just lit.
 */
export function Led({ state, className = "" }: { state: LedState; className?: string }) {
  const lit = state === "live" || state === "on" || state === "danger";
  const core =
    state === "danger"
      ? "bg-danger"
      : lit
        ? "bg-ink"
        : state === "dim"
          ? "bg-muted/60"
          : "bg-line-strong";
  return (
    <span className={`relative inline-flex size-2 shrink-0 ${className}`} aria-hidden="true">
      {lit ? (
        <span
          className={`absolute inset-0 rounded-full ${state === "danger" ? "shadow-led-danger" : "shadow-led"} ${
            state === "live" ? "motion-safe:animate-led" : ""
          }`}
        />
      ) : null}
      <span className={`relative size-2 rounded-full ${core}`} />
    </span>
  );
}

/* ---------- Form controls ---------- */

/**
 * Text inputs sit in a recessed well. Add height, padding and corner radius at the call site.
 * An invalid field gets a dashed ink border: visible, but not red, because red is
 * reserved for trust and security.
 */
export const inputClass =
  "border border-line-strong bg-well text-ink inset-shadow-well transition-colors duration-150 placeholder:text-muted/80 hover:border-muted focus:border-ink aria-invalid:border-dashed aria-invalid:border-ink";

export function Switch({
  checked,
  onChange,
  ...aria
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${HIT_SLOP} ${
        checked ? "border-ink bg-ink" : "border-line-strong bg-well inset-shadow-well"
      }`}
      {...aria}
    >
      <span
        className={`inline-block size-4 rounded-full shadow-knob transition duration-200 ease-spring ${
          checked ? "translate-x-6 bg-raised" : "translate-x-1 bg-muted"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

/** A toggle (aria-pressed). Selected chips are raised and lit; the rest stay flat. */
export function ToggleChip({
  pressed,
  onToggle,
  children,
  title,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-2 text-sm transition duration-150 ease-press active:translate-y-px active:shadow-key-pressed ${
        pressed
          ? "border-line-strong bg-raised bg-linear-to-b from-ink/7 to-transparent text-ink shadow-key hover:border-muted/60"
          : "text-muted hover:border-line-strong hover:text-ink"
      }`}
    >
      <span
        className={`grid size-4 place-items-center rounded-full border ${
          pressed ? "border-ink bg-ink text-canvas" : "border-line-strong bg-well inset-shadow-well"
        }`}
        aria-hidden="true"
      >
        {pressed ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      {children}
    </button>
  );
}

/* ---------- Feedback ---------- */

/** Operational errors (network, API). Neutral on purpose: red is reserved for trust & security. */
export function ErrorNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm text-ink ${className}`}
    >
      <CircleX className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function Spinner({ className = "size-4", label }: { className?: string; label?: string }) {
  return (
    <LoaderCircle
      className={`${className} shrink-0 animate-spin`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

/** "Nothing here yet." One look for every empty section. */
export function EmptyState({
  icon: Icon,
  compact = false,
  className = "",
  children,
}: {
  icon?: LucideIcon;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 text-center text-sm text-muted ${
        compact ? "py-5" : "py-10"
      } ${className}`}
    >
      {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
      <p>{children}</p>
    </div>
  );
}

/** A loading bar. `bg-line` shows on both `surface` and `raised`. */
export function Skeleton({ width }: { width: string }) {
  return <div className="h-3 animate-pulse rounded bg-line" style={{ width }} />;
}

/* ---------- Section header ---------- */

export function SectionHeader({
  step,
  title,
  id,
  description,
  children,
}: {
  step: string;
  title: string;
  id: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="flex items-baseline gap-2.5 text-base font-semibold tracking-tight">
          <span className="font-mono text-xs font-normal text-muted" aria-hidden="true">
            {step}
          </span>
          {title}
        </h2>
        {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
