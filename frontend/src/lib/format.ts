/** Formatting helpers. Prices are always sv-SE ("9 441 kr"); UI copy is English. */

const sekFormatters = new Map<number, Intl.NumberFormat>();

function sekFormatter(decimals: number): Intl.NumberFormat {
  let f = sekFormatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: "SEK",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    sekFormatters.set(decimals, f);
  }
  return f;
}

/** 9441 → "9 441 kr", 56.1 → "56,10 kr". Whole kronor are shown without decimals. */
export function formatSek(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const rounded = Math.round(value * 100) / 100;
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  return sekFormatter(decimals).format(rounded);
}

const intFormatter = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

/** 128400 → "128 400" */
export function formatInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return intFormatter.format(Math.round(value));
}

const usdSmall = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const usdLarge = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 0.1083 → "$0.108", 4.2 → "$4.20" */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return (Math.abs(value) < 1 ? usdSmall : usdLarge).format(value);
}

/** 0.0372 → "3.7%" ; whole numbers drop the decimal. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "–";
  const pct = Math.round(fraction * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/** Timer style: 12 → "0:12", 65 → "1:05", 3723 → "1:02:03" */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Metrics style: 24.62 → "24.6 s", 142 → "2 min 22 s" */
export function formatSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "–";
  if (totalSeconds < 60) return `${(Math.round(totalSeconds * 10) / 10).toFixed(1)} s`;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds - m * 60);
  return `${m} min ${s} s`;
}

/** Parses an ISO timestamp; returns ms since epoch or null. */
export function parseTime(iso: string | number | null | undefined): number | null {
  if (iso == null) return null;
  if (typeof iso === "number") return Number.isFinite(iso) ? iso : null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

const clockFormatter = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** "12:03:41" */
export function formatClock(time: string | number | null | undefined): string {
  const t = parseTime(time);
  return t == null ? "–" : clockFormatter.format(t);
}

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

/** "2026-11-27 12:03:41 CET" */
export function formatDateTime(time: string | number | null | undefined): string {
  const t = parseTime(time);
  return t == null ? "–" : dateTimeFormatter.format(t);
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

/** "just now", "42 sec. ago", "3 min. ago", "2 hr. ago" */
export function formatRelative(time: string | number | null | undefined, now: number): string {
  const t = parseTime(time);
  if (t == null) return "–";
  const diffS = Math.round((t - now) / 1000);
  const abs = Math.abs(diffS);
  if (abs < 10) return "just now";
  if (abs < 60) return relativeFormatter.format(diffS, "second");
  if (abs < 3600) return relativeFormatter.format(Math.round(diffS / 60), "minute");
  if (abs < 86400) return relativeFormatter.format(Math.round(diffS / 3600), "hour");
  return relativeFormatter.format(Math.round(diffS / 86400), "day");
}

/** "prompt_injection" → "Prompt injection" */
export function humanize(value: string): string {
  const s = value.replace(/[_.-]+/g, " ").trim();
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Strips protocol and trailing slash for compact log display. */
export function compactUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
