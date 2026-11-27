/**
 * Server-Sent Events for a hunt.
 *
 * - Every `data:` payload is JSON with a `type`; it is parsed and validated (sanitize.ts).
 * - Resume: the browser's EventSource re-sends `Last-Event-ID` on its own reconnects.
 *   If the connection is closed for good (readyState CLOSED) we open a new EventSource
 *   and pass the last id as `?last_event_id=` because EventSource cannot set headers.
 * - Dedupe: a replayed event (same id and same payload) is dropped, so a resume that
 *   overlaps never double-applies an event. The payload hash is part of the key because
 *   an event without an `id:` line inherits the previous id per the SSE spec.
 */
import type { HuntEvent, HuntEventType } from "../types";
import { sanitizeEvent } from "./sanitize";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface StreamCallbacks {
  onEvent: (event: HuntEvent) => void;
  onConnection?: (state: ConnectionState) => void;
  /** Called once if reconnecting is abandoned. */
  onGiveUp?: () => void;
}

/** Per-hunt resume state; survives reconnects and re-subscribes. */
export interface EventCursor {
  lastId: string | null;
  seen: Set<string>;
}

export function createEventCursor(): EventCursor {
  return { lastId: null, seen: new Set() };
}

/** FNV-1a, 32-bit. Cheap fingerprint so we don't keep whole payloads in memory. */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${s.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

/**
 * Parses, validates and dedupes one raw SSE message. Shared by the real EventSource
 * and the mock, so both go through exactly the same path.
 */
export function ingestRawEvent(
  cursor: EventCursor,
  id: string | null,
  data: string,
): HuntEvent | null {
  if (id) {
    const key = `${id}#${fingerprint(data)}`;
    if (cursor.seen.has(key)) return null;
    cursor.seen.add(key);
    cursor.lastId = id;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return sanitizeEvent(parsed);
}

const EVENT_TYPES: HuntEventType[] = [
  "hunt.started",
  "plan.ready",
  "store.status",
  "store.action",
  "store.screenshot",
  "offer.found",
  "verdict.ready",
  "security.event",
  "ranking.ready",
  "metrics",
  "hunt.done",
  "error",
];

const MAX_RECONNECTS = 8;

/** Opens the hunt event stream. Returns a function that closes it for good. */
export function openEventStream(
  url: string,
  cursor: EventCursor,
  callbacks: StreamCallbacks,
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const handle = (msg: MessageEvent<string>) => {
    if (closed) return;
    const event = ingestRawEvent(cursor, msg.lastEventId || null, msg.data);
    if (event) callbacks.onEvent(event);
  };

  const connect = () => {
    if (closed) return;
    const target = new URL(url, window.location.href);
    if (cursor.lastId) target.searchParams.set("last_event_id", cursor.lastId);
    callbacks.onConnection?.(attempts === 0 ? "connecting" : "reconnecting");

    const es = new EventSource(target.href);
    source = es;
    es.onopen = () => {
      attempts = 0;
      callbacks.onConnection?.("open");
    };
    // Default (unnamed) events, as in the contract.
    es.onmessage = handle;
    // Also accept named events (`event: store.status`) in case the server uses them.
    for (const type of EVENT_TYPES) es.addEventListener(type, handle as EventListener);
    es.onerror = () => {
      if (closed) return;
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        attempts += 1;
        if (attempts > MAX_RECONNECTS) {
          callbacks.onConnection?.("closed");
          callbacks.onGiveUp?.();
          return;
        }
        const delay = Math.min(15_000, 1000 * 2 ** (attempts - 1));
        callbacks.onConnection?.("reconnecting");
        timer = setTimeout(connect, delay);
      } else {
        // The browser retries by itself and sends Last-Event-ID.
        callbacks.onConnection?.("reconnecting");
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    source?.close();
    source = null;
  };
}
