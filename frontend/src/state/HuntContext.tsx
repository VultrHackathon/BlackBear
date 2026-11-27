import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { api, errorMessage } from "../api/client";
import { createEventCursor, type EventCursor } from "../api/events";
import type { HuntRequest } from "../types";
import { createInitialState, huntReducer, type HuntState } from "./huntReducer";

const AUTO_APPROVE_KEY = "blackbear.autoApprove";

export interface HuntActions {
  startHunt: (request: Omit<HuntRequest, "auto_approve">) => Promise<void>;
  approve: () => Promise<void>;
  /** Abandons the current hunt and puts the cursor back in the query field. */
  editQuery: () => void;
  setAutoApprove: (value: boolean) => void;
  reverify: (offerId: string) => Promise<void>;
  /** Approve-before-submit gate: approve or deny a paused agent action. */
  resolveGate: (approvalId: string, approve: boolean) => Promise<string | null>;
  toggleCompare: (offerId: string) => void;
  clearCompare: () => void;
  /** HuntForm registers its query input so "Edit query" can focus it. */
  registerQueryInput: (el: HTMLInputElement | null) => void;
}

const StateContext = createContext<HuntState | null>(null);
const ActionsContext = createContext<HuntActions | null>(null);

function readAutoApprove(): boolean {
  try {
    return window.localStorage.getItem(AUTO_APPROVE_KEY) === "true";
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function HuntProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(huntReducer, undefined, () => createInitialState(readAutoApprove()));

  // Mirrors of state for use inside stable callbacks.
  const stateRef = useRef(state);
  stateRef.current = state;

  const queryInputRef = useRef<HTMLInputElement | null>(null);
  // One resume cursor per hunt: survives reconnects and StrictMode re-subscribes.
  const cursors = useRef(new Map<string, EventCursor>());

  /* ---- Config ---- */
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .getConfig(ctrl.signal)
      .then((config) => dispatch({ type: "config/loaded", config }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) dispatch({ type: "config/failed", message: errorMessage(err) });
      });
    return () => ctrl.abort();
  }, []);

  /* ---- Persist auto-approve ---- */
  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_APPROVE_KEY, String(state.autoApprove));
    } catch {
      /* storage unavailable */
    }
  }, [state.autoApprove]);

  /* ---- Live event stream for the current hunt ---- */
  const huntId = state.huntId;
  useEffect(() => {
    if (!huntId) return;
    let cursor = cursors.current.get(huntId);
    if (!cursor) {
      cursor = createEventCursor();
      cursors.current.set(huntId, cursor);
    }
    let finished = false;
    let close: (() => void) | null = null;
    close = api.subscribe(huntId, cursor, {
      onEvent: (event) => {
        dispatch({ type: "stream/event", huntId, event, at: Date.now() });
        if (event.type === "security.event") {
          // Kept out of the chat on purpose; developers and judges can follow them here.
          const log = event.blocked ? console.info : console.warn;
          log(`[blackbear security] ${event.kind} at ${event.store_id}: ${event.blocked ? "stopped by" : "got past"} ${event.layer}. ${event.detail}`);
        }
        if (event.type === "hunt.done" || event.type === "error") {
          // Terminal: close so EventSource doesn't auto-reconnect forever.
          finished = true;
          close?.();
          dispatch({ type: "stream/connection", huntId, state: "closed" });
        }
      },
      onConnection: (conn) => {
        if (!finished) dispatch({ type: "stream/connection", huntId, state: conn });
      },
      onGiveUp: () => dispatch({ type: "stream/lost", huntId }),
    });
    if (finished) close();
    return () => {
      finished = true;
      close?.();
    };
  }, [huntId]);

  /* ---- Actions ---- */
  const startHunt = useCallback(async (req: Omit<HuntRequest, "auto_approve">) => {
    const request: HuntRequest = { ...req, auto_approve: stateRef.current.autoApprove };
    dispatch({ type: "hunt/create", request, at: Date.now() });
    try {
      const { hunt_id } = await api.createHunt(request);
      dispatch({ type: "hunt/created", huntId: hunt_id });
    } catch (err) {
      dispatch({ type: "hunt/createFailed", message: errorMessage(err) });
    }
  }, []);

  const approve = useCallback(async () => {
    const id = stateRef.current.huntId;
    if (!id) return;
    dispatch({ type: "hunt/approve" });
    try {
      await api.approveHunt(id);
      if (stateRef.current.huntId === id) dispatch({ type: "hunt/approved" });
    } catch (err) {
      if (stateRef.current.huntId === id) dispatch({ type: "hunt/approveFailed", message: errorMessage(err) });
    }
  }, []);

  const editQuery = useCallback(() => {
    dispatch({ type: "hunt/reset" });
    requestAnimationFrame(() => {
      const input = queryInputRef.current;
      if (!input) return;
      input.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      input.focus({ preventScroll: true });
      input.select();
    });
  }, []);

  const setAutoApprove = useCallback((value: boolean) => {
    dispatch({ type: "settings/autoApprove", value });
  }, []);

  const reverify = useCallback(async (offerId: string) => {
    const id = stateRef.current.huntId;
    dispatch({ type: "reverify/start", offerId });
    try {
      const result = await api.reverifyOffer(offerId);
      if (stateRef.current.huntId === id) dispatch({ type: "reverify/done", result });
    } catch (err) {
      if (stateRef.current.huntId === id)
        dispatch({ type: "reverify/failed", offerId, message: errorMessage(err) });
    }
  }, []);

  const resolveGate = useCallback(async (approvalId: string, approve: boolean) => {
    dispatch({ type: "gate/sending", id: approvalId });
    try {
      await api.resolveApproval(approvalId, approve);
      return null;
    } catch (err) {
      return errorMessage(err); // the stream's approval.resolved event is the source of truth
    }
  }, []);

  const toggleCompare = useCallback((offerId: string) => dispatch({ type: "compare/toggle", offerId }), []);
  const clearCompare = useCallback(() => dispatch({ type: "compare/clear" }), []);
  const registerQueryInput = useCallback((el: HTMLInputElement | null) => {
    queryInputRef.current = el;
  }, []);

  const actions = useMemo<HuntActions>(
    () => ({
      startHunt,
      approve,
      editQuery,
      setAutoApprove,
      reverify,
      resolveGate,
      toggleCompare,
      clearCompare,
      registerQueryInput,
    }),
    [startHunt, approve, editQuery, setAutoApprove, reverify, resolveGate, toggleCompare, clearCompare, registerQueryInput],
  );

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </StateContext.Provider>
  );
}

export function useHuntState(): HuntState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useHuntState must be used inside <HuntProvider>");
  return ctx;
}

export function useHuntActions(): HuntActions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useHuntActions must be used inside <HuntProvider>");
  return ctx;
}
