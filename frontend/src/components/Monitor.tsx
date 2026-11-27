/**
 * The shared pieces of a sandbox "glass monitor": the screen itself, the status
 * vocabulary, the action log line, the activity strip and the timer. Used by the
 * grid tile (StoreTile) and the larger view (SandboxFocus).
 *
 * Everything here visualises state the reducer already holds. Nothing is invented.
 */
import {
  Camera,
  Check,
  CircleX,
  Clock,
  Globe,
  ImageOff,
  LoaderCircle,
  MonitorOff,
  Power,
  ScanSearch,
  ScanText,
  ShieldExclamationPoint,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatClock, formatTimer } from "../lib/format";
import { formatAction, kindLabel, layerLabel } from "../lib/labels";
import { useNow } from "../lib/useNow";
import { MAX_ACTIONS, type ActionEntry, type Frame, type TileAlert } from "../state/huntReducer";
import type { StoreStatus } from "../types";
import type { LedState } from "./ui";

/* ---------- Status vocabulary ---------- */

export const STATUS_META: Record<
  StoreStatus,
  { label: string; icon: LucideIcon; tone: string; led: LedState; spin?: boolean; live?: boolean }
> = {
  queued: { label: "queued", icon: Clock, tone: "text-muted", led: "off" },
  starting: { label: "starting", icon: LoaderCircle, tone: "text-ink", led: "live", spin: true },
  browsing: { label: "browsing", icon: Globe, tone: "text-ink", led: "live", live: true },
  extracting: { label: "extracting", icon: ScanText, tone: "text-ink", led: "live", live: true },
  verifying: { label: "verifying", icon: ScanSearch, tone: "text-ink", led: "live", live: true },
  done: { label: "done", icon: Check, tone: "text-ink", led: "on" },
  blocked: { label: "blocked", icon: ShieldExclamationPoint, tone: "text-danger", led: "danger" },
  failed: { label: "failed", icon: CircleX, tone: "text-muted", led: "dim" },
};

/** Icon + word. The word carries the meaning; lights and motion only back it up. */
export function StatusLabel({ status, id, large = false }: { status: StoreStatus; id?: string; large?: boolean }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      id={id}
      className={`inline-flex shrink-0 items-center gap-1 font-mono ${large ? "text-xs" : "text-2xs"} ${meta.tone}`}
    >
      <Icon className={`${large ? "size-3.5" : "size-3"} ${meta.spin ? "animate-spin" : ""}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** One sentence for the last blocked thing in a sandbox, or null. */
export function describeAlert(alert: TileAlert | null): string | null {
  if (!alert) return null;
  if (alert.kind && alert.layer) {
    return alert.blocked === false
      ? `${kindLabel(alert.kind)} got past the ${layerLabel(alert.layer).toLowerCase()}`
      : `${kindLabel(alert.kind)} stopped by the ${layerLabel(alert.layer).toLowerCase()}`;
  }
  return alert.reason;
}

/* ---------- Timer ---------- */

/** Ticks on its own, so a second passing re-renders this text and not the whole tile. */
export function Elapsed({ startedAt, endedAt }: { startedAt: number | null; endedAt: number | null }) {
  const active = startedAt != null && endedAt == null;
  const now = useNow(active, 1000);
  const elapsed = startedAt != null ? ((endedAt ?? now) - startedAt) / 1000 : 0;
  return <span className="tabular-nums">{formatTimer(elapsed)}</span>;
}

/* ---------- Action log ---------- */

/** A block cursor after the newest log line while the agent is working. */
function Caret() {
  return <span className="ml-1 inline-block h-3 w-1.5 shrink-0 self-center bg-ink motion-safe:animate-caret" aria-hidden="true" />;
}

/**
 * One line of the action log: `07 click .add-to-cart`. In a tile it is a single
 * truncated line; `detailed` wraps it and adds the time and the block reason.
 */
export function ActionLine({
  entry,
  caret = false,
  detailed = false,
}: {
  entry: ActionEntry;
  caret?: boolean;
  detailed?: boolean;
}) {
  const text = formatAction(entry.action);
  return (
    <li className={`motion-safe:animate-fade-in ${entry.allowed ? "text-ink/90" : "text-danger"}`}>
      <div className="flex min-w-0 gap-1.5">
        <span className="shrink-0 text-muted tabular-nums">{String(entry.step).padStart(2, "0")}</span>
        {entry.allowed ? null : (
          <span className="shrink-0" aria-hidden="true">
            ✕
          </span>
        )}
        {entry.allowed ? null : <span className="sr-only">Blocked:</span>}
        <span className={detailed ? "min-w-0 flex-1 break-words" : "truncate"}>{text}</span>
        {caret ? <Caret /> : null}
        {detailed ? <time className="shrink-0 text-muted tabular-nums">{formatClock(entry.at)}</time> : null}
      </div>
      {detailed && !entry.allowed && entry.reason ? (
        <p className="pl-[1.6rem] break-words text-danger/90">{entry.reason}</p>
      ) : null}
    </li>
  );
}

/**
 * One mark per agent action still in memory (the last 20), red for a blocked one.
 * A quick read of how much a sandbox has done and whether anything was stopped.
 */
export function ActionTicks({ actions }: { actions: ActionEntry[] }) {
  const blocked = actions.filter((a) => !a.allowed).length;
  const label =
    actions.length === 0
      ? "No actions yet"
      : `${actions.length} recent ${actions.length === 1 ? "action" : "actions"}${blocked ? `, ${blocked} blocked` : ""}`;
  return (
    <div role="img" aria-label={label} className="flex h-2 gap-0.5">
      {Array.from({ length: MAX_ACTIONS }, (_, i) => {
        const a = actions[i];
        return (
          <span
            key={a ? a.key : `empty-${i}`}
            className={`flex-1 rounded-[1px] ${
              a ? `motion-safe:animate-fade-in ${a.allowed ? "bg-ink/75" : "bg-danger"}` : "bg-line"
            }`}
          />
        );
      })}
    </div>
  );
}

/* ---------- Screen ---------- */

interface Layer {
  key: number;
  src: string;
  loaded: boolean;
}

/** Four corner brackets: the agent is checking what it sees. */
function Reticle() {
  const corner = "absolute size-3 border-ink";
  return (
    <span
      className="pointer-events-none absolute inset-2 drop-shadow-[0_0_1.5px_rgb(0_0_0)] motion-safe:animate-reticle"
      aria-hidden="true"
    >
      <span className={`${corner} top-0 left-0 border-t-2 border-l-2`} />
      <span className={`${corner} top-0 right-0 border-t-2 border-r-2`} />
      <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${corner} right-0 bottom-0 border-r-2 border-b-2`} />
    </span>
  );
}

/** A label along the bottom edge of the glass. It never covers more than a strip of the screenshot. */
function Plate({
  icon: Icon,
  danger = false,
  large,
  children,
}: {
  icon: LucideIcon;
  danger?: boolean;
  large: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 border-t bg-canvas/90 font-mono ${
        large ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-2xs"
      } ${danger ? "border-danger/40 text-danger" : "text-ink"}`}
    >
      <Icon className={large ? "size-3.5 shrink-0" : "size-3 shrink-0"} aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * The screen of a sandbox: a bezel, recessed glass, and the latest screenshot.
 * A new screenshot is stacked on the previous one and fades in once it has loaded.
 *
 * What moves, and only while the sandbox is working:
 * - any live status: a light travels round the bezel
 * - extracting: a beam sweeps down the glass
 * - verifying: corner brackets pulse
 * Finished sandboxes are completely still.
 */
export function Monitor({
  frame,
  rejected,
  status,
  alt,
  standby = false,
  captured = false,
  bootLine = null,
  large = false,
}: {
  frame: Frame | null;
  /** Screenshots refused because they came from an untrusted origin. */
  rejected: number;
  status: StoreStatus;
  alt: string;
  /** Waiting for the plan to be approved: nothing runs yet. */
  standby?: boolean;
  /** This sandbox produced an offer. `done` alone does not mean that: a run with no match is also done. */
  captured?: boolean;
  /** Shown on the glass while the sandbox boots and has no screenshot yet. */
  bootLine?: string | null;
  large?: boolean;
}) {
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    if (!frame) {
      setLayers([]);
      return;
    }
    setLayers((prev) => {
      if (prev.some((l) => l.key === frame.key)) return prev;
      const keep = prev.filter((l) => l.loaded).slice(-1);
      return [...keep, { key: frame.key, src: frame.src, loaded: false }];
    });
  }, [frame]);

  const markLoaded = (key: number) =>
    setLayers((prev) => prev.map((l) => (l.key === key ? { ...l, loaded: true } : l)));
  const drop = (key: number) => setLayers((prev) => prev.filter((l) => l.key !== key));
  // Once the top layer has faded in, the ones underneath can go.
  const settle = (key: number) =>
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.key === key);
      return i > 0 && prev[i]?.loaded ? prev.slice(i) : prev;
    });

  const anyVisible = layers.some((l) => l.loaded);
  const live = STATUS_META[status].live === true && !standby;
  const blocked = status === "blocked";
  const iconSize = large ? "size-6" : "size-4";

  let placeholder: ReactNode;
  if (rejected > 0) {
    placeholder = (
      <>
        <ImageOff className={iconSize} aria-hidden="true" />
        Screenshot not loaded: untrusted origin
      </>
    );
  } else if (standby || status === "queued") {
    placeholder = (
      <>
        <Power className={iconSize} aria-hidden="true" />
        standby
      </>
    );
  } else if (status === "starting") {
    placeholder = (
      <span className="font-mono text-ink/90">
        {bootLine ?? "starting"}
        <Caret />
      </span>
    );
  } else if (status === "failed") {
    placeholder = (
      <>
        <MonitorOff className={iconSize} aria-hidden="true" />
        no signal
      </>
    );
  } else {
    placeholder = (
      <>
        <Camera className={iconSize} aria-hidden="true" />
        No screenshot yet
      </>
    );
  }

  return (
    <div
      className={`relative overflow-hidden p-[3px] ${large ? "rounded-2xl" : "rounded-[0.65rem]"} ${
        blocked ? "bg-danger/80 shadow-alarm" : "bg-linear-to-b from-line-strong to-line"
      }`}
    >
      {live ? (
        <span className="bezel-orbit hidden motion-safe:block motion-safe:animate-orbit" aria-hidden="true" />
      ) : null}

      <div
        className={`glass-sheen relative aspect-[16/10] overflow-hidden bg-well ${
          large ? "rounded-[0.8rem]" : "rounded-[0.5rem]"
        }`}
      >
        {layers.map((l, i) => {
          const isTop = i === layers.length - 1;
          return (
            <img
              key={l.key}
              src={l.src}
              alt={isTop ? alt : ""}
              aria-hidden={isTop ? undefined : true}
              decoding="async"
              draggable={false}
              referrerPolicy="no-referrer"
              onLoad={() => markLoaded(l.key)}
              onError={() => drop(l.key)}
              onTransitionEnd={() => settle(l.key)}
              className={`absolute inset-0 size-full object-cover object-top transition-opacity duration-500 ease-out ${
                l.loaded ? "opacity-100" : "opacity-0"
              } ${status === "failed" ? "grayscale" : ""}`}
            />
          );
        })}

        {!anyVisible ? (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-muted ${
              large ? "p-6 text-sm" : "p-2 text-2xs"
            }`}
          >
            {placeholder}
          </div>
        ) : null}

        {status === "extracting" && !standby ? (
          <span className="scan-beam hidden motion-safe:block motion-safe:animate-scan" aria-hidden="true" />
        ) : null}
        {status === "verifying" && !standby ? <Reticle /> : null}

        {blocked ? (
          <Plate icon={ShieldExclamationPoint} danger large={large}>
            contained
          </Plate>
        ) : status === "done" && captured ? (
          <Plate icon={Check} large={large}>
            offer captured
          </Plate>
        ) : null}
      </div>
    </div>
  );
}
