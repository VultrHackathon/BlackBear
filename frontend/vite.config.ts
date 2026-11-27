import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Injects a strict Content-Security-Policy into the production build.
 * (Not applied in dev: the React Fast Refresh preamble is an inline script.)
 *
 * - Scripts and styles only from our own origin.
 * - Images only from our origin, the API origin and data: URLs (mock screenshots).
 * - fetch/EventSource only to our origin and the API origin.
 */
function contentSecurityPolicy(apiBase: string): Plugin {
  let apiOrigin = "";
  if (/^https?:\/\//i.test(apiBase)) {
    try {
      apiOrigin = new URL(apiBase).origin;
    } catch {
      apiOrigin = "";
    }
  }
  const self = ["'self'", apiOrigin].filter(Boolean).join(" ");
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src ${self} data:`,
    `connect-src ${self}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");

  return {
    name: "blackbear-csp",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: policy },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE ?? "";
  // Where the dev server proxies /api when VITE_API_BASE is empty and mock mode is off.
  // Not prefixed with VITE_, so it is never exposed to the browser bundle.
  const proxyTarget = env.BLACKBEAR_PROXY_TARGET || "http://localhost:8000";

  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(apiBase)],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
