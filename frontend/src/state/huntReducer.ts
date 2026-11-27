/**
 * All hunt state lives here. Every SSE event type maps to a state change in
 * applyEvent(); UI-originated actions (create, approve, re-verify, compare) are
 * handled in huntReducer(). The reducer is pure: timestamps arrive in the action.
 */
import type { ConnectionState } from "../api/events";
import { safeImageSrc } from "../lib/security";
import type {
  AgentAction,
  AppConfig,
  HuntEvent,
  HuntRequest,
  Metrics,
  Offer,
  Plan,
  ReverifyResponse,
  SecurityKind,
  SecurityLayer,
  StoreStatus,
  Trust,
} from "../types";

export const MAX_ACTIONS = 20;
export const MAX_SECURITY_EVENTS = 200;
const TERMINAL: ReadonlySet<StoreStatus> = new Set<StoreStatus>(["done", "blocked", "failed"]);

/* ---------- State shape ---------- */

export interface ActionEntry {
  key: string;
  step: number;
  action: AgentAction;
  allowed: boolean;
  reason?: string;
  at: number;
}

export interface Frame {
  key: number;
  src: string;
}

/** Last blocked thing in a tile; `seq` changes to retrigger the red flash. */
export interface TileAlert {
  seq: number;
  at: number;
  reason: string;
  kind?: SecurityKind;
  layer?: SecurityLayer;
  /** For security events: was the attack stopped? */
  blocked?: boolean;
}

export interface StoreRun {
  storeId: string;
  status: StoreStatus;
  message: string | null;
  actions: ActionEntry[];
  frame: Frame | null;
  rejectedScreenshots: number;
  startedAt: number | null;
  endedAt: number | null;
  alert: TileAlert | null;
}

export interface SecurityEntry {
  key: string;
  at: number;
  store_id: string;
  kind: SecurityKind;
  layer: SecurityLayer;
  detail: string;
  blocked: boolean;
}

export type HuntPhase =
  | "idle"
  | "creating"
  | "planning"
  | "awaiting_approval"
  | "running"
  | "done"
  | "error";

export type Approval = "none" | "pending" | "approved" | "auto";

export type ReverifyState =
  | { status: "pending" }
  | { status: "same"; at: string }
  | { status: "changed"; at: string; previous: number; price: number }
  | { status: "error"; message: string };

export interface HuntState {
  config: AppConfig | null;
  configStatus: "loading" | "ready" | "error";
  configError: string | null;
  autoApprove: boolean;

  phase: HuntPhase;
  huntId: string | null;
  request: HuntRequest | null;
  query: string;
  plan: Plan | null;
  approval: Approval;
  approvalError: string | null;

  storeOrder: string[];
  stores: Record<string, StoreRun>;

  offerOrder: string[];
  offers: Record<string, Offer>;
  /** Verdicts that arrived before their offer. */
  pendingVerdicts: Record<string, Trust>;
  ranking: string[] | null;
  summaryMd: string | null;

  security: SecurityEntry[];
  metrics: Metrics | null;

  startedAt: number | null;
  finishedAt: number | null;
  elapsedS: number | null;
  error: string | null;
  connection: ConnectionState | "idle";
  eventCount: number;

  reverify: Record<string, ReverifyState>;
  compare: string[];
  /** Approve-before-submit gates, newest last. */
  gates: GateEntry[];
}

export interface GateEntry {
  id: string;
  storeId: string;
  step: number;
  action: AgentAction;
  reason: string;
  screenshot: string | null;
  requestedAt: number;
  timeoutS: number;
  status: "pending" | "sending" | "approved" | "denied";
  by: string;
}

/* ---------- Actions ---------- */

export type HuntAction =
  | { type: "config/loaded"; config: AppConfig }
  | { type: "config/failed"; message: string }
  | { type: "settings/autoApprove"; value: boolean }
  | { type: "hunt/create"; request: HuntRequest; at: number }
  | { type: "hunt/created"; huntId: string }
  | { type: "hunt/createFailed"; message: string }
  | { type: "hunt/approve" }
  | { type: "hunt/approved" }
  | { type: "hunt/approveFailed"; message: string }
  | { type: "hunt/reset" }
  | { type: "stream/connection"; huntId: string; state: ConnectionState }
  | { type: "stream/lost"; huntId: string }
  | { type: "stream/event"; huntId: string; event: HuntEvent; at: number }
  | { type: "reverify/start"; offerId: string }
  | { type: "reverify/done"; result: ReverifyResponse }
  | { type: "reverify/failed"; offerId: string; message: string }
  | { type: "compare/toggle"; offerId: string }
  | { type: "compare/clear" }
  | { type: "gate/sending"; id: string };

/* ---------- Init ---------- */

const huntSlice = () => ({
  phase: "idle" as HuntPhase,
  huntId: null,
  request: null,
  query: "",
  plan: null,
  approval: "none" as Approval,
  approvalError: null,
  storeOrder: [],
  stores: {},
  offerOrder: [],
  offers: {},
  pendingVerdicts: {},
  ranking: null,
  summaryMd: null,
  security: [],
  metrics: null,
  startedAt: null,
  finishedAt: null,
  elapsedS: null,
  error: null,
  connection: "idle" as const,
  eventCount: 0,
  reverify: {},
  compare: [],
  gates: [] as GateEntry[],
});

export function createInitialState(autoApprove = false): HuntState {
  return {
    config: null,
    configStatus: "loading",
    configError: null,
    autoApprove,
    ...huntSlice(),
  };
}

function newRun(storeId: string): StoreRun {
  return {
    storeId,
    status: "queued",
    message: null,
    actions: [],
    frame: null,
    rejectedScreenshots: 0,
    startedAt: null,
    endedAt: null,
    alert: null,
  };
}

function withRun(s: HuntState, run: StoreRun): HuntState {
  const known = s.storeOrder.includes(run.storeId);
  return {
    ...s,
    stores: { ...s.stores, [run.storeId]: run },
    storeOrder: known ? s.storeOrder : [...s.storeOrder, run.storeId],
  };
}

function runOf(s: HuntState, storeId: string): StoreRun {
  return s.stores[storeId] ?? newRun(storeId);
}

function nextAlert(run: StoreRun, at: number, reason: string, extra: Partial<TileAlert> = {}): TileAlert {
  return { seq: (run.alert?.seq ?? 0) + 1, at, reason, ...extra };
}

/* ---------- Events ---------- */

function applyEvent(state: HuntState, e: HuntEvent, at: number): HuntState {
  const s: HuntState = { ...state, eventCount: state.eventCount + 1 };

  switch (e.type) {
    case "hunt.started":
      return {
        ...s,
        query: e.query || s.query,
        startedAt: s.startedAt ?? at,
        phase: s.phase === "creating" || s.phase === "idle" ? "planning" : s.phase,
      };

    case "plan.ready": {
      const order = [...new Set(e.plan.tasks.map((t) => t.store_id))];
      const stores = { ...s.stores };
      for (const id of order) if (!stores[id]) stores[id] = newRun(id);
      const extra = s.storeOrder.filter((id) => !order.includes(id));
      const auto = s.request?.auto_approve ?? false;
      let phase = s.phase;
      if (phase === "planning" || phase === "creating") phase = auto ? "running" : "awaiting_approval";
      return {
        ...s,
        plan: e.plan,
        storeOrder: [...order, ...extra],
        stores,
        phase,
        approval: auto ? "auto" : s.approval,
      };
    }

    case "store.status": {
      const run = runOf(s, e.store_id);
      const active = e.status !== "queued";
      const next: StoreRun = {
        ...run,
        status: e.status,
        message: e.message ?? (e.status === run.status ? run.message : null),
        startedAt: run.startedAt ?? (active ? at : null),
        endedAt: TERMINAL.has(e.status) ? (run.endedAt ?? at) : null,
      };
      let { phase, approval } = s;
      // The backend dispatched agents: approval happened (here, elsewhere, or auto).
      if (active && (phase === "awaiting_approval" || phase === "planning")) {
        phase = "running";
        if (approval === "none" || approval === "pending") approval = "approved";
      }
      return withRun({ ...s, phase, approval }, next);
    }

    case "store.action": {
      const run = runOf(s, e.store_id);
      const entry: ActionEntry = {
        key: `${s.eventCount}`,
        step: e.step,
        action: e.action,
        allowed: e.allowed,
        ...(e.reason ? { reason: e.reason } : {}),
        at,
      };
      return withRun(s, {
        ...run,
        actions: [...run.actions, entry].slice(-MAX_ACTIONS),
        alert: e.allowed
          ? run.alert
          : nextAlert(run, at, e.reason || "Action blocked by the action firewall"),
      });
    }

    case "store.screenshot": {
      const run = runOf(s, e.store_id);
      const src = safeImageSrc(e.url);
      if (!src) return withRun(s, { ...run, rejectedScreenshots: run.rejectedScreenshots + 1 });
      return withRun(s, { ...run, frame: { key: (run.frame?.key ?? 0) + 1, src } });
    }

    case "offer.found": {
      const prev = s.offers[e.offer.id];
      const trust = e.offer.trust ?? prev?.trust ?? s.pendingVerdicts[e.offer.id];
      const offer: Offer = trust ? { ...e.offer, trust } : e.offer;
      const pendingVerdicts = { ...s.pendingVerdicts };
      delete pendingVerdicts[e.offer.id];
      return {
        ...s,
        offers: { ...s.offers, [offer.id]: offer },
        offerOrder: prev ? s.offerOrder : [...s.offerOrder, offer.id],
        pendingVerdicts,
      };
    }

    case "verdict.ready": {
      const offer = s.offers[e.offer_id];
      if (!offer) return { ...s, pendingVerdicts: { ...s.pendingVerdicts, [e.offer_id]: e.trust } };
      return { ...s, offers: { ...s.offers, [e.offer_id]: { ...offer, trust: e.trust } } };
    }

    case "security.event": {
      const entry: SecurityEntry = {
        key: `sec-${s.eventCount}`,
        at,
        store_id: e.store_id,
        kind: e.kind,
        layer: e.layer,
        detail: e.detail,
        blocked: e.blocked,
      };
      const next: HuntState = { ...s, security: [entry, ...s.security].slice(0, MAX_SECURITY_EVENTS) };
      const run = next.stores[e.store_id];
      if (!run) return next;
      return withRun(next, {
        ...run,
        alert: nextAlert(run, at, e.detail, { kind: e.kind, layer: e.layer, blocked: e.blocked }),
      });
    }

    case "approval.required": {
      if (s.gates.some((g) => g.id === e.approval_id)) return s;
      const gate: GateEntry = {
        id: e.approval_id,
        storeId: e.store_id,
        step: e.step,
        action: e.action,
        reason: e.reason,
        screenshot: safeImageSrc(e.screenshot_url),
        requestedAt: at,
        timeoutS: e.timeout_s,
        status: "pending",
        by: "",
      };
      const run = runOf(s, e.store_id);
      return withRun({ ...s, gates: [...s.gates, gate].slice(-20) }, {
        ...run,
        message: "Paused: waiting for your approval",
      });
    }

    case "approval.resolved":
      return {
        ...s,
        gates: s.gates.map((g) =>
          g.id === e.approval_id ? { ...g, status: e.approved ? "approved" : "denied", by: e.by } : g,
        ),
      };

    case "ranking.ready":
      return { ...s, ranking: e.ranking, summaryMd: e.summary_md };

    case "metrics":
      return {
        ...s,
        metrics: {
          llm_calls: e.llm_calls,
          tokens: e.tokens,
          cost_usd: e.cost_usd,
          sandbox_seconds: e.sandbox_seconds,
        },
      };

    case "hunt.done":
      return { ...s, phase: "done", elapsedS: e.elapsed_s, finishedAt: at };

    case "error":
      return { ...s, phase: "error", error: e.message, finishedAt: s.finishedAt ?? at };
  }
}

/* ---------- Reducer ---------- */

export function huntReducer(state: HuntState, action: HuntAction): HuntState {
  switch (action.type) {
    case "gate/sending":
      return { ...state, gates: state.gates.map((g) => (g.id === action.id ? { ...g, status: "sending" } : g)) };
    case "config/loaded":
      return { ...state, config: action.config, configStatus: "ready", configError: null };

    case "config/failed":
      return { ...state, configStatus: "error", configError: action.message };

    case "settings/autoApprove":
      return { ...state, autoApprove: action.value };

    case "hunt/create":
      return {
        ...state,
        ...huntSlice(),
        phase: "creating",
        request: action.request,
        query: action.request.query,
        startedAt: action.at,
      };

    case "hunt/created":
      if (state.phase !== "creating") return state;
      return { ...state, huntId: action.huntId, phase: "planning", connection: "connecting" };

    case "hunt/createFailed":
      return { ...state, phase: "error", error: action.message };

    case "hunt/approve":
      return { ...state, approval: "pending", approvalError: null };

    case "hunt/approved":
      return {
        ...state,
        approval: state.approval === "auto" ? "auto" : "approved",
        phase: state.phase === "awaiting_approval" ? "running" : state.phase,
      };

    case "hunt/approveFailed":
      return {
        ...state,
        approval: state.approval === "pending" ? "none" : state.approval,
        approvalError: action.message,
      };

    case "hunt/reset":
      return { ...state, ...huntSlice() };

    case "stream/connection":
      if (action.huntId !== state.huntId) return state;
      return { ...state, connection: action.state };

    case "stream/lost":
      if (action.huntId !== state.huntId) return state;
      if (state.phase === "done" || state.phase === "error") return state;
      return {
        ...state,
        phase: "error",
        connection: "closed",
        error: "Lost the connection to the live event stream. Start the hunt again to retry.",
      };

    case "stream/event":
      // Ignore stragglers from a previous hunt's stream.
      if (action.huntId !== state.huntId) return state;
      return applyEvent(state, action.event, action.at);

    case "reverify/start":
      return { ...state, reverify: { ...state.reverify, [action.offerId]: { status: "pending" } } };

    case "reverify/done": {
      const r = action.result;
      const offer = state.offers[r.offer_id];
      if (!offer) return state;
      const changed = !r.same_price && r.price_sek !== offer.price_sek;
      const status: ReverifyState = changed
        ? { status: "changed", at: r.captured_at, previous: offer.price_sek, price: r.price_sek }
        : { status: "same", at: r.captured_at };
      return {
        ...state,
        offers: {
          ...state.offers,
          [r.offer_id]: {
            ...offer,
            price_sek: r.price_sek,
            captured_at: r.captured_at || offer.captured_at,
            screenshot_url: r.screenshot_url || offer.screenshot_url,
          },
        },
        reverify: { ...state.reverify, [r.offer_id]: status },
      };
    }

    case "reverify/failed":
      return {
        ...state,
        reverify: { ...state.reverify, [action.offerId]: { status: "error", message: action.message } },
      };

    case "compare/toggle": {
      const has = state.compare.includes(action.offerId);
      if (has) return { ...state, compare: state.compare.filter((id) => id !== action.offerId) };
      if (state.compare.length >= 2) return state;
      return { ...state, compare: [...state.compare, action.offerId] };
    }

    case "compare/clear":
      return { ...state, compare: [] };
  }
}

/* ---------- Selectors ---------- */

export function selectRankedOffers(s: HuntState): { offers: Offer[]; provisional: boolean } {
  const all = s.offerOrder.map((id) => s.offers[id]).filter((o): o is Offer => !!o);
  if (s.ranking) {
    const pos = new Map(s.ranking.map((id, i) => [id, i]));
    // Ranked first, then offers waiting only on shipping, then excluded ones (mismatch, out of stock).
    const group = (o: Offer) => (pos.has(o.id) ? 0 : o.shipping_sek === null && o.trust?.label !== "fake" ? 1 : 2);
    const rank = (o: Offer) => pos.get(o.id) ?? Number.MAX_SAFE_INTEGER;
    return {
      offers: [...all].sort(
        (a, b) => group(a) - group(b) || rank(a) - rank(b) || a.effective_total_sek - b.effective_total_sek,
      ),
      provisional: false,
    };
  }
  return {
    offers: [...all].sort((a, b) => a.effective_total_sek - b.effective_total_sek),
    provisional: true,
  };
}

export function selectStatusCounts(s: HuntState): Record<StoreStatus, number> {
  const counts: Record<StoreStatus, number> = {
    queued: 0,
    starting: 0,
    browsing: 0,
    extracting: 0,
    verifying: 0,
    done: 0,
    blocked: 0,
    failed: 0,
  };
  for (const id of s.storeOrder) {
    const run = s.stores[id];
    if (run) counts[run.status] += 1;
  }
  return counts;
}

export function selectSecurityStats(s: HuntState) {
  const attempted = s.security.length;
  const blocked = s.security.filter((e) => e.blocked).length;
  const byLayer: Record<string, number> = {};
  for (const e of s.security) if (e.blocked) byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
  return {
    attempted,
    blocked,
    succeeded: attempted - blocked,
    successRate: attempted ? (attempted - blocked) / attempted : null,
    byLayer,
  };
}

export function isHuntActive(phase: HuntPhase): boolean {
  return phase === "creating" || phase === "planning" || phase === "awaiting_approval" || phase === "running";
}
