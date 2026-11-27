/**
 * Runtime validation for everything the backend sends. Values that originate from
 * store pages are hostile: we coerce shapes, cap string lengths and drop anything
 * malformed. Rendering is text-only regardless; this layer keeps state well-typed.
 */
import {
  ACTION_TYPES,
  STORE_STATUSES,
  type ActionType,
  type AgentAction,
  type AppConfig,
  type BreakdownRow,
  type CompareResponse,
  type HuntEvent,
  type Offer,
  type Plan,
  type Promo,
  type PromoType,
  type ReverifyResponse,
  type StoreConfig,
  type StoreStatus,
  type Trust,
  type TrustLabel,
} from "../types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, max = 2000): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function nullableNum(v: unknown): number | null | undefined {
  if (v === null) return null;
  return num(v);
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function strArray(v: unknown, maxItems = 50, maxLen = 2000): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .slice(0, maxItems)
    .map((x) => x.slice(0, maxLen));
}

const PROMO_TYPES = new Set<string>([
  "multibuy",
  "percent_off",
  "amount_off",
  "member_price",
  "code",
  "free_shipping_over",
]);
const TRUST_LABELS = new Set<string>(["real", "questionable", "fake", "unknown"]);
const STATUS_SET = new Set<string>(STORE_STATUSES);
const ACTION_SET = new Set<string>(ACTION_TYPES);

/* ---------- Domain objects ---------- */

export function sanitizePromo(v: unknown): Promo | null {
  if (!isObj(v)) return null;
  const text = str(v.text, 300);
  const type = str(v.type, 40);
  if (!text || !type) return null;
  const promo: Promo = {
    // Unknown promo types are kept (rendered with a generic icon) rather than hidden.
    type: (PROMO_TYPES.has(type) ? type : "amount_off") as PromoType,
    text,
  };
  const buy = num(v.buy);
  const payFor = num(v.pay_for);
  const bundle = num(v.bundle_price_sek);
  const percent = num(v.percent);
  const code = str(v.code, 60);
  if (buy !== undefined) promo.buy = buy;
  if (payFor !== undefined) promo.pay_for = payFor;
  if (bundle !== undefined) promo.bundle_price_sek = bundle;
  if (percent !== undefined) promo.percent = percent;
  if (code !== undefined) promo.code = code;
  if (v.requires_membership === null) promo.requires_membership = null;
  else if (typeof v.requires_membership === "string")
    promo.requires_membership = v.requires_membership.slice(0, 120);
  if (v.applied_in_cart === null) promo.applied_in_cart = null;
  else if (typeof v.applied_in_cart === "boolean") promo.applied_in_cart = v.applied_in_cart;
  return promo;
}

export function sanitizeTrust(v: unknown): Trust | null {
  if (!isObj(v)) return null;
  const label = str(v.label, 20);
  return {
    label: (label && TRUST_LABELS.has(label) ? label : "unknown") as TrustLabel,
    reasons: strArray(v.reasons, 20, 600),
  };
}

export function sanitizeOffer(v: unknown): Offer | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 200);
  const storeId = str(v.store_id, 100);
  const title = str(v.title, 400);
  const price = num(v.price_sek);
  const total = num(v.effective_total_sek);
  if (!id || !storeId || title === undefined || price === undefined || total === undefined) {
    return null;
  }
  const quantity = Math.max(1, Math.round(num(v.quantity) ?? 1));
  const offer: Offer = {
    id,
    store_id: storeId,
    title,
    url: str(v.url, 2000) ?? "",
    price_sek: price,
    previous_price_sek: nullableNum(v.previous_price_sek) ?? null,
    lowest_30d_price_sek: nullableNum(v.lowest_30d_price_sek) ?? null,
    shipping_sek: nullableNum(v.shipping_sek) ?? null,
    in_stock: bool(v.in_stock) ?? true,
    promos: Array.isArray(v.promos)
      ? v.promos
          .slice(0, 20)
          .map(sanitizePromo)
          .filter((p): p is Promo => p !== null)
      : [],
    quantity,
    effective_total_sek: total,
    effective_unit_sek: num(v.effective_unit_sek) ?? total / quantity,
    screenshot_url: str(v.screenshot_url, 3_000_000) ?? "",
    captured_at: str(v.captured_at, 64) ?? "",
  };
  const model = str(v.model_number, 120);
  if (model) offer.model_number = model;
  const trust = v.trust === undefined ? null : sanitizeTrust(v.trust);
  if (trust) offer.trust = trust;
  return offer;
}

function sanitizePlan(v: unknown): Plan | null {
  if (!isObj(v)) return null;
  const tasks = Array.isArray(v.tasks)
    ? v.tasks
        .filter(isObj)
        .map((t) => ({ store_id: str(t.store_id, 100) ?? "", search_query: str(t.search_query, 300) ?? "" }))
        .filter((t) => t.store_id !== "")
        .slice(0, 50)
    : [];
  return { criteria: strArray(v.criteria, 30, 400), tasks };
}

function sanitizeAction(v: unknown): AgentAction | null {
  if (!isObj(v)) return null;
  const type = str(v.type, 30);
  if (!type || !ACTION_SET.has(type)) return null;
  const action: AgentAction = { type: type as ActionType };
  const target = str(v.target, 500);
  const text = str(v.text, 500);
  if (target !== undefined) action.target = target;
  if (text !== undefined) action.text = text;
  return action;
}

/* ---------- SSE events ---------- */

export function sanitizeEvent(v: unknown): HuntEvent | null {
  if (!isObj(v) || typeof v.type !== "string") return null;
  switch (v.type) {
    case "hunt.started": {
      const hunt_id = str(v.hunt_id, 200);
      return hunt_id ? { type: "hunt.started", hunt_id, query: str(v.query, 300) ?? "" } : null;
    }
    case "plan.ready": {
      const plan = sanitizePlan(v.plan);
      return plan ? { type: "plan.ready", plan } : null;
    }
    case "store.status": {
      const store_id = str(v.store_id, 100);
      const status = str(v.status, 30);
      if (!store_id || !status || !STATUS_SET.has(status)) return null;
      const message = str(v.message, 600);
      return {
        type: "store.status",
        store_id,
        status: status as StoreStatus,
        ...(message !== undefined ? { message } : {}),
      };
    }
    case "store.action": {
      const store_id = str(v.store_id, 100);
      const action = sanitizeAction(v.action);
      if (!store_id || !action) return null;
      const reason = str(v.reason, 600);
      return {
        type: "store.action",
        store_id,
        step: Math.max(0, Math.round(num(v.step) ?? 0)),
        action,
        // A missing flag is treated as allowed; only an explicit false flashes the tile.
        allowed: bool(v.allowed) ?? true,
        ...(reason !== undefined ? { reason } : {}),
      };
    }
    case "store.screenshot": {
      const store_id = str(v.store_id, 100);
      const url = str(v.url, 3_000_000);
      return store_id && url ? { type: "store.screenshot", store_id, url } : null;
    }
    case "offer.found": {
      const offer = sanitizeOffer(v.offer);
      return offer ? { type: "offer.found", offer } : null;
    }
    case "verdict.ready": {
      const offer_id = str(v.offer_id, 200);
      const trust = sanitizeTrust(v.trust);
      return offer_id && trust ? { type: "verdict.ready", offer_id, trust } : null;
    }
    case "security.event": {
      const store_id = str(v.store_id, 100);
      if (!store_id) return null;
      return {
        type: "security.event",
        store_id,
        kind: str(v.kind, 60) ?? "unknown",
        layer: str(v.layer, 60) ?? "unknown",
        detail: str(v.detail, 1000) ?? "",
        // Conservative: if the backend doesn't say it was blocked, don't claim it was.
        blocked: bool(v.blocked) ?? false,
      };
    }
    case "ranking.ready":
      return {
        type: "ranking.ready",
        ranking: strArray(v.ranking, 200, 200),
        summary_md: str(v.summary_md, 8000) ?? "",
      };
    case "metrics":
      return {
        type: "metrics",
        llm_calls: num(v.llm_calls) ?? 0,
        tokens: num(v.tokens) ?? 0,
        cost_usd: num(v.cost_usd) ?? 0,
        sandbox_seconds: num(v.sandbox_seconds) ?? 0,
      };
    case "hunt.done":
      return { type: "hunt.done", elapsed_s: num(v.elapsed_s) ?? 0 };
    case "error":
      return { type: "error", message: str(v.message, 1000) ?? "Unknown error" };
    default:
      return null;
  }
}

/* ---------- REST responses ---------- */

export function sanitizeConfig(v: unknown): AppConfig {
  const o = isObj(v) ? v : {};
  const stores: StoreConfig[] = Array.isArray(o.stores)
    ? o.stores
        .filter(isObj)
        .map((s) => {
          const store: StoreConfig = {
            id: str(s.id, 100) ?? "",
            name: str(s.name, 120) ?? "",
            domain: str(s.domain, 255) ?? "",
          };
          if (s.honeypot === true) store.honeypot = true;
          return store;
        })
        .filter((s) => s.id !== "")
    : [];
  return {
    model: str(o.model, 120) ?? "unknown model",
    runtime: str(o.runtime, 120) ?? "unknown runtime",
    stores,
    memberships: strArray(o.memberships, 50, 120),
  };
}

export function sanitizeHuntCreated(v: unknown): { hunt_id: string } {
  const id = isObj(v) ? str(v.hunt_id, 200) : undefined;
  if (!id) throw new Error("Backend did not return a hunt_id");
  return { hunt_id: id };
}

export function sanitizeReverify(v: unknown): ReverifyResponse {
  const o = isObj(v) ? v : {};
  const offer_id = str(o.offer_id, 200);
  const price = num(o.price_sek);
  if (!offer_id || price === undefined) throw new Error("Malformed re-verify response");
  return {
    offer_id,
    same_price: bool(o.same_price) ?? false,
    price_sek: price,
    captured_at: str(o.captured_at, 64) ?? "",
    screenshot_url: str(o.screenshot_url, 3_000_000) ?? "",
  };
}

export function sanitizeCompare(v: unknown): CompareResponse {
  const o = isObj(v) ? v : {};
  const breakdown: BreakdownRow[] = Array.isArray(o.breakdown)
    ? o.breakdown
        .filter(isObj)
        .slice(0, 30)
        .map((r) => ({
          label: str(r.label, 120) ?? "",
          a: str(r.a, 600) ?? "",
          b: str(r.b, 600) ?? "",
        }))
    : [];
  return {
    winner_id: str(o.winner_id, 200) ?? "",
    explanation_md: str(o.explanation_md, 8000) ?? "",
    breakdown,
  };
}
