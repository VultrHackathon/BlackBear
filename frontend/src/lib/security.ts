/**
 * URL allowlisting. Store content is hostile: nothing from the backend is trusted
 * to be a safe URL until it passes one of these checks.
 */
import { API_BASE } from "./env";

/** Raster/vector image data URLs only; no text/html, no application/*. */
const DATA_IMAGE_URL = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml)(?:;[a-z0-9=._+-]+)*,/i;

function apiBaseUrl(): URL | null {
  try {
    // Trailing slash so relative paths resolve *inside* the base path.
    return new URL(`${API_BASE}/`, window.location.origin);
  } catch {
    return null;
  }
}

/**
 * Screenshots may only come from the API origin (VITE_API_BASE, or same origin when
 * empty) or from data:image URLs. Returns a safe src or null.
 */
export function safeImageSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;

  if (/^data:/i.test(url)) return DATA_IMAGE_URL.test(url) ? url : null;

  const base = apiBaseUrl();
  if (!base) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.origin !== base.origin) return null;
  return parsed.href;
}

/** Markdown links: absolute http(s) only. Everything else (javascript:, data:, relative) is dropped. */
export function safeLinkHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Does the URL's host equal the store's allowed domain (or a subdomain of it)? */
export function hostMatchesDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const d = domain.toLowerCase().replace(/^\*\./, "");
    return host === d || host.endsWith(`.${d}`);
  } catch {
    return false;
  }
}

/** Hostname of a URL, or null if it doesn't parse. */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
