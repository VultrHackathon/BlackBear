/**
 * Typed API client. In mock mode (VITE_USE_MOCK=true, the default) every call is
 * served by ./mock, which is loaded lazily so it stays out of the real bundle path.
 */
import { API_BASE, USE_MOCK } from "../lib/env";
import type {
  AppConfig,
  CompareResponse,
  HuntCreated,
  HuntRequest,
  ReverifyResponse,
} from "../types";
import { ingestRawEvent, openEventStream, type EventCursor, type StreamCallbacks } from "./events";
import {
  sanitizeCompare,
  sanitizeConfig,
  sanitizeHuntCreated,
  sanitizeReverify,
} from "./sanitize";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const loadMock = () => import("./mock");

interface RequestOptions {
  method?: "GET" | "POST";
  json?: unknown;
  signal?: AbortSignal;
}

async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const headers = new Headers({ Accept: "application/json" });
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
    credentials: "same-origin",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data: unknown = await res.json();
      if (data && typeof data === "object" && "detail" in data) {
        const d = (data as { detail: unknown }).detail;
        if (typeof d === "string") detail = d.slice(0, 300);
      }
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(res.status, detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined;
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : undefined;
}

const enc = encodeURIComponent;

export const api = {
  async getConfig(signal?: AbortSignal): Promise<AppConfig> {
    const raw = USE_MOCK
      ? await (await loadMock()).mockServer.getConfig()
      : await request("/api/config", { signal });
    return sanitizeConfig(raw);
  },

  async createHunt(body: HuntRequest): Promise<HuntCreated> {
    const raw = USE_MOCK
      ? await (await loadMock()).mockServer.createHunt(body)
      : await request("/api/hunts", { method: "POST", json: body });
    return sanitizeHuntCreated(raw);
  },

  async approveHunt(huntId: string): Promise<void> {
    if (USE_MOCK) return (await loadMock()).mockServer.approveHunt(huntId);
    await request(`/api/hunts/${enc(huntId)}/approve`, { method: "POST" });
  },

  /** Approve-before-submit gate: approve or deny a paused agent action. */
  async resolveApproval(approvalId: string, approve: boolean): Promise<void> {
    if (USE_MOCK) return;
    await request(`/api/approvals/${enc(approvalId)}`, { method: "POST", json: { approve } });
  },

  async reverifyOffer(offerId: string): Promise<ReverifyResponse> {
    const raw = USE_MOCK
      ? await (await loadMock()).mockServer.reverifyOffer(offerId)
      : await request(`/api/offers/${enc(offerId)}/reverify`, { method: "POST" });
    return sanitizeReverify(raw);
  },

  async compare(offerA: string, offerB: string, signal?: AbortSignal): Promise<CompareResponse> {
    const raw = USE_MOCK
      ? await (await loadMock()).mockServer.compare({ offer_a: offerA, offer_b: offerB }, signal)
      : await request("/api/compare", {
          method: "POST",
          json: { offer_a: offerA, offer_b: offerB },
          signal,
        });
    return sanitizeCompare(raw);
  },

  /**
   * Subscribes to a hunt's events. The cursor carries Last-Event-ID and the dedupe set,
   * so pass the same cursor when re-subscribing to the same hunt.
   */
  subscribe(huntId: string, cursor: EventCursor, callbacks: StreamCallbacks): () => void {
    if (!USE_MOCK) {
      return openEventStream(`${API_BASE}/api/hunts/${enc(huntId)}/events`, cursor, callbacks);
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    callbacks.onConnection?.("connecting");
    void loadMock().then(({ mockServer }) => {
      if (cancelled) return;
      callbacks.onConnection?.("open");
      unsubscribe = mockServer.subscribe(huntId, cursor.lastId, (id, data) => {
        if (cancelled) return;
        const event = ingestRawEvent(cursor, id, data);
        if (event) callbacks.onEvent(event);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  },
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof DOMException && err.name === "AbortError") return "Request was cancelled";
  if (err instanceof TypeError) return "Can't reach the blackbear API. Is the backend running?";
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
