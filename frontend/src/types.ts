/**
 * Shared types. These mirror the FastAPI contract exactly; see README "API contract".
 * Everything here that originates from a store page is untrusted text and must be
 * rendered as text only.
 */

/* ---------- Config ---------- */

export interface StoreConfig {
  id: string;
  name: string;
  domain: string;
  honeypot?: boolean;
}

export interface AppConfig {
  model: string;
  runtime: string;
  stores: StoreConfig[];
  memberships: string[];
}

/* ---------- Hunts ---------- */

export interface HuntRequest {
  query: string;
  quantity: number;
  budget_sek: number | null;
  memberships: string[];
  store_ids: string[];
  auto_approve: boolean;
}

export interface HuntCreated {
  hunt_id: string;
}

export interface PlanTask {
  store_id: string;
  search_query: string;
}

export interface Plan {
  criteria: string[];
  tasks: PlanTask[];
}

/* ---------- Store agents ---------- */

export const STORE_STATUSES = [
  "queued",
  "starting",
  "browsing",
  "extracting",
  "verifying",
  "done",
  "blocked",
  "failed",
] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const ACTION_TYPES = ["goto", "click", "type", "scroll", "extract", "add_to_cart"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface AgentAction {
  type: ActionType;
  target?: string;
  text?: string;
}

/* ---------- Offers ---------- */

export type PromoType =
  | "multibuy"
  | "percent_off"
  | "amount_off"
  | "member_price"
  | "code"
  | "free_shipping_over";

export type Promo = {
  type: PromoType;
  text: string;
  buy?: number;
  pay_for?: number;
  bundle_price_sek?: number;
  percent?: number;
  code?: string;
  requires_membership?: string | null;
  applied_in_cart?: boolean | null;
};

export type TrustLabel = "real" | "questionable" | "fake" | "unknown";

export type Trust = { label: TrustLabel; reasons: string[] };

export type Offer = {
  id: string;
  store_id: string;
  title: string;
  model_number?: string;
  url: string;
  price_sek: number;
  previous_price_sek?: number | null;
  lowest_30d_price_sek?: number | null;
  shipping_sek: number | null;
  /** Why the offer is not ranked (e.g. "shipping not shown", "cart mismatch"). */
  unranked_reason?: string;
  in_stock: boolean;
  promos: Promo[];
  quantity: number;
  effective_total_sek: number;
  effective_unit_sek: number;
  screenshot_url: string;
  captured_at: string;
  trust?: Trust;
};

/* ---------- Security ---------- */

/** Known values; the backend may add more, which we render humanized. */
export type SecurityKind =
  | "prompt_injection"
  | "redirect"
  | "exfiltration"
  | "checkout_attempt"
  | (string & {});

export type SecurityLayer =
  | "egress_proxy"
  | "action_firewall"
  | "injection_guard"
  | "number_check"
  | (string & {});

/* ---------- Other endpoints ---------- */

export interface ReverifyResponse {
  offer_id: string;
  same_price: boolean;
  price_sek: number;
  captured_at: string;
  screenshot_url: string;
}

export interface CompareRequest {
  /** Offer id */
  offer_a: string;
  /** Offer id */
  offer_b: string;
}

export interface BreakdownRow {
  label: string;
  a: string;
  b: string;
}

export interface CompareResponse {
  winner_id: string;
  explanation_md: string;
  breakdown: BreakdownRow[];
}

export interface Metrics {
  llm_calls: number;
  tokens: number;
  cost_usd: number;
  sandbox_seconds: number;
}

/* ---------- SSE events ---------- */

export type HuntEvent =
  | { type: "hunt.started"; hunt_id: string; query: string }
  | { type: "plan.ready"; plan: Plan }
  | { type: "store.status"; store_id: string; status: StoreStatus; message?: string }
  | {
      type: "store.action";
      store_id: string;
      step: number;
      action: AgentAction;
      allowed: boolean;
      reason?: string;
    }
  | { type: "store.screenshot"; store_id: string; url: string }
  | { type: "offer.found"; offer: Offer }
  | { type: "verdict.ready"; offer_id: string; trust: Trust }
  | {
      type: "security.event";
      store_id: string;
      kind: SecurityKind;
      layer: SecurityLayer;
      detail: string;
      blocked: boolean;
    }
  | { type: "ranking.ready"; ranking: string[]; summary_md: string }
  | ({ type: "metrics" } & Metrics)
  | { type: "hunt.done"; elapsed_s: number }
  | { type: "error"; message: string };

export type HuntEventType = HuntEvent["type"];
