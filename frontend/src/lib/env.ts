/** Runtime configuration from Vite env vars (see .env.example). */

/** Backend base URL without trailing slash. "" means same origin. */
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? "").trim().replace(/\/+$/, "");

/** Mock mode is ON unless VITE_USE_MOCK is explicitly "false". */
export const USE_MOCK: boolean =
  String(import.meta.env.VITE_USE_MOCK ?? "true").trim().toLowerCase() !== "false";
