/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL. Empty = same origin. */
  readonly VITE_API_BASE?: string;
  /** "true" (default) = mock replay, "false" = real API. */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
