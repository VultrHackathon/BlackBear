import { ArrowRight, ArrowUp, Plus, ShieldCheck, ShieldExclamationPoint, Trophy, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { deliveryChangesWinner, itemsTotal, membershipBeatsBest, rankedOffers } from "../lib/deals";
import { formatSek } from "../lib/format";
import { hasMembership } from "../lib/membership";
import { navigate } from "../lib/router";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import { selectStatusCounts, type HuntState } from "../state/huntReducer";
import { api } from "../api/client";
import { BrandMark } from "./BrandMark";
import { SafeMarkdown } from "./SafeMarkdown";
import { StoreMark } from "./StoreMark";
import { Button } from "./ui";

/* ---------- The conversation as data ---------- */

export type Msg =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "agent"; text: string }
  | { id: string; kind: "typing"; text: string }
  | { id: string; kind: "plan"; stores: { id: string; name: string }[] }
  | { id: string; kind: "progress"; finished: number; total: number }
  | { id: string; kind: "security"; what: string; layer: string; blocked: boolean }
  | {
      id: string;
      kind: "best";
      offerId: string;
      storeId: string;
      storeName: string;
      price: number;
      why: string | null;
    };

export interface Question {
  id: string;
  text: string;
  options: { label: string; primary?: boolean; onPick: () => void }[];
}

export interface Conversation {
  /** Everything said so far, oldest first. The open question is separate. */
  thread: Msg[];
  question: Question | null;
  status: string;
  value: string;
  setValue: (v: string) => void;
  /** Sends what is in the composer. */
  submit: () => void;
  /** Sends a query from elsewhere on the page (header or home search). */
  ask: (text: string) => void;
  pickExample: (index: number) => void;
  newSearch: () => void;
  ready: boolean;
}

export const EXAMPLES = [
  { label: "Alvedon 500 mg, 20 st × 2", query: "Alvedon 500 mg 20 st", quantity: 2, image: `${import.meta.env.BASE_URL}products/alvedon-500mg.jpg`, stores: 4 },
  { label: "Saffran 0,5 g × 2", query: "Saffran 0,5 g", quantity: 2, image: `${import.meta.env.BASE_URL}products/hjartat-saffran.webp`, stores: 4 },
] as const;

const NOTHING_RANKED = "No offer could be ranked with the available price and shipping evidence.";

/**
 * What the agent says about the hunt in progress, built from the hunt state alone so
 * it can never drift from what the page shows. Ids are stable per hunt.
 */
function deriveThread(s: HuntState): Msg[] {
  const h = s.startedAt ?? 0;
  const out: Msg[] = [];
  const nameOf = (id: string) => s.config?.stores.find((x) => x.id === id)?.name ?? id;

  if (!s.plan && (s.phase === "creating" || s.phase === "planning")) {
    out.push({ id: `typing-${h}`, kind: "typing", text: "Planning which stores to search" });
  }
  if (s.plan) {
    out.push({
      id: `plan-${h}`,
      kind: "plan",
      stores: s.plan.tasks.map((t) => ({ id: t.store_id, name: nameOf(t.store_id) })),
    });
  }
  if (s.approval === "approved") out.push({ id: `go-${h}`, kind: "user", text: "Start hunting" });
  if (s.approval === "auto" && s.plan) out.push({ id: `go-${h}`, kind: "agent", text: "Auto-approved. Going." });

  const total = s.storeOrder.length;
  const begun = s.phase === "running" || s.phase === "done" || (s.phase === "error" && total > 0 && s.approval !== "none");
  if (begun && total > 0) {
    const c = selectStatusCounts(s);
    out.push({ id: `progress-${h}`, kind: "progress", finished: c.done + c.blocked + c.failed, total });
  }

  // The security log keeps newest first; the conversation reads oldest first.
  // Security events stay out of the conversation: they are on the Safety page and in the
  // browser console (logged in HuntContext as they arrive).

  if (s.phase === "error" && s.error) {
    out.push({ id: `err-${h}`, kind: "agent", text: `Something went wrong: ${s.error}` });
  }

  const anyOffers = s.offerOrder.length > 0;
  if (s.ranking !== null) {
    // Only a ranked offer can be the best deal (unknown shipping, cart mismatch or no stock are not ranked).
    const best = rankedOffers(s.offers, s.ranking)[0];
    if (best) {
      out.push({
        id: `best-${h}`,
        kind: "best",
        offerId: best.id,
        storeId: best.store_id,
        storeName: nameOf(best.store_id),
        price: best.effective_total_sek,
        why: s.summaryMd,
      });
    } else {
      out.push({ id: `none-${h}`, kind: "agent", text: anyOffers ? NOTHING_RANKED : "No offers this time. Try something else?" });
    }
  } else if (s.phase === "done" && !anyOffers) {
    out.push({ id: `none-${h}`, kind: "agent", text: "No offers this time. Try something else?" });
  }
  return out;
}

/**
 * The conversation: what the shopper typed, what the agent asked, and the live hunt in
 * between. Questions are asked only when the data makes them worth asking.
 */
export function useConversation(
  includeDelivery: boolean,
  setIncludeDelivery: (v: boolean) => void,
): Conversation {
  const state = useHuntState();
  const { startHunt, approve, editQuery } = useHuntActions();
  const seq = useRef(0);
  const nid = (p: string) => `${p}-local-${++seq.current}`;

  /** Said before the current hunt, or in earlier hunts. */
  const [history, setHistory] = useState<Msg[]>([]);
  /** Said about the current hunt after its results. */
  const [answers, setAnswers] = useState<Msg[]>([]);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState<string | null>(null);
  /** A hunt whose live messages were already moved into history. */
  const [detachedFrom, setDetachedFrom] = useState<number | null>(null);
  /** Memberships the shopper confirmed in this session. */
  const [memberships, setMemberships] = useState<string[]>([]);
  const [value, setValue] = useState("");
  /** Waiting for the chat model to read the shopper's message. */
  const [thinking, setThinking] = useState(false);

  const live = state.phase !== "idle" && state.startedAt != null && state.startedAt !== detachedFrom;
  const derived = useMemo(() => (live ? deriveThread(state) : []), [live, state]);
  const ready = state.config !== null;

  const say = (kind: "user" | "agent", text: string): Msg => ({ id: nid(kind), kind, text });

  /** Moves the current hunt's messages into history, so a new hunt starts below them. */
  const freeze = (extra: Msg[] = []) => {
    const keep = derived.filter((m) => m.kind !== "typing");
    setHistory((h) => [...h, ...keep, ...answers, ...extra]);
    setAnswers([]);
    setAnswered(new Set());
    if (live) setDetachedFrom(state.startedAt);
  };

  const start = (query: string, quantity: number, withMemberships: string[]) => {
    if (!state.config) return;
    void startHunt({
      query: query.slice(0, 200),
      quantity,
      budget_sek: null,
      memberships: withMemberships,
      store_ids: state.config.stores.map((s) => s.id),
    });
    navigate({ name: "results" });
  };

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text || !ready || thinking) return;
    if (live) freeze();
    const recent = [...history, ...derived, ...answers]
      .filter((m): m is Extract<Msg, { kind: "user" | "agent" }> => m.kind === "user" || m.kind === "agent")
      .slice(-6)
      .map((m) => ({ role: m.kind, text: m.text }));
    setHistory((h) => [...h, say("user", text)]);
    setDraft(null);
    setThinking(true);
    void api
      .chat(text, recent)
      .then((turn) => {
        if (turn.reply) setHistory((h) => [...h, say("agent", turn.reply)]);
        if (turn.intent === "hunt" && turn.query) {
          // Quantity said in the message: go straight away. Otherwise ask once.
          if (turn.quantity) start(turn.query, turn.quantity, memberships);
          else setDraft(turn.query);
        }
      })
      .catch(() => setDraft(text)) // chat model unreachable: treat it as a product search
      .finally(() => setThinking(false));
  };

  const submit = () => {
    ask(value);
    setValue("");
  };

  const pickExample = (index: number) => {
    const ex = EXAMPLES[index];
    if (!ex || !ready) return;
    if (live) freeze();
    setDraft(null);
    setHistory((h) => [...h, say("user", ex.label)]);
    start(ex.query, ex.quantity, memberships);
  };

  const newSearch = () => {
    editQuery();
    setHistory([]);
    setAnswers([]);
    setAnswered(new Set());
    setDraft(null);
    setDetachedFrom(null);
    setValue("");
  };

  /* ---- The one open question, if any ---- */
  let question: Question | null = null;
  const request = state.request;

  if (draft !== null) {
    question = {
      id: "qty",
      text: `How many of “${draft}” do you need?`,
      options: [1, 2, 3, 4, 5, 6].map((n) => ({
        label: String(n),
        primary: n === 1,
        onPick: () => {
          setHistory((h) => [...h, say("agent", `How many of “${draft}” do you need?`), say("user", String(n))]);
          setDraft(null);
          start(draft, n, memberships);
        },
      })),
    };
  } else if (live && state.phase === "awaiting_approval" && state.plan && state.approval !== "pending") {
    question = {
      id: "approve",
      text: "Start the search?",
      options: [
        { label: "Start hunting", primary: true, onPick: () => void approve() },
        {
          label: "Change",
          onPick: () => {
            const q = request?.query ?? "";
            newSearch();
            setValue(q);
          },
        },
      ],
    };
  } else if (live && state.ranking !== null && request) {
    const ranked = rankedOffers(state.offers, state.ranking);
    const flip = deliveryChangesWinner(ranked);
    const chance = membershipBeatsBest(ranked, request.memberships);
    const nameOf = (id: string) => state.config?.stores.find((x) => x.id === id)?.name ?? id;

    if (flip && !answered.has("delivery")) {
      const text = `Without delivery, ${nameOf(flip.store_id)} is cheapest at ${formatSek(itemsTotal(flip))}. Count delivery in the price?`;
      const answer = (include: boolean, label: string) => {
        setIncludeDelivery(include);
        setAnswered((a) => new Set(a).add("delivery"));
        setAnswers((m) => [
          ...m,
          say("agent", text),
          say("user", label),
          ...(include
            ? []
            : [say("agent", `Sorted by product price. ${nameOf(flip.store_id)} leads at ${formatSek(itemsTotal(flip))}.`)]),
        ]);
      };
      question = {
        id: "delivery",
        text,
        options: [
          { label: "Yes, include it", primary: includeDelivery, onPick: () => answer(true, "Include delivery") },
          { label: "Product price only", primary: !includeDelivery, onPick: () => answer(false, "Product price only") },
        ],
      };
    } else if (chance && !answered.has(`member:${chance.membership}`)) {
      const store = nameOf(chance.offer.store_id);
      const text = `${store} is ${formatSek(chance.memberTotal)} for ${chance.membership} members. That beats the best deal. Are you a member?`;
      const listed =
        state.config?.memberships.find((m) => hasMembership([m], chance.membership)) ?? chance.membership;
      question = {
        id: `member:${chance.membership}`,
        text,
        options: [
          {
            label: "Yes, search again",
            primary: true,
            onPick: () => {
              const next = memberships.includes(listed) ? memberships : [...memberships, listed];
              setMemberships(next);
              freeze([
                say("agent", text),
                say("user", `Yes, I'm a ${chance.membership} member`),
                say("agent", `Searching again with ${chance.membership} prices.`),
              ]);
              const withMembership = request.memberships.includes(listed)
                ? request.memberships
                : [...request.memberships, listed];
              start(request.query, request.quantity, withMembership);
            },
          },
          {
            label: "No",
            onPick: () => {
              setAnswered((a) => new Set(a).add(`member:${chance.membership}`));
              setAnswers((m) => [...m, say("agent", text), say("user", "No")]);
            },
          },
        ],
      };
    }
  }

  const c = selectStatusCounts(state);
  const finished = c.done + c.blocked + c.failed;
  const status =
    draft !== null || question?.id === "approve"
      ? "Waiting for you"
      : state.phase === "creating" || state.phase === "planning"
        ? "Planning…"
        : state.phase === "running"
          ? `Hunting · ${finished}/${state.storeOrder.length}`
          : state.phase === "done"
            ? question
              ? "One question"
              : "Done"
            : state.phase === "error"
              ? "Stopped"
              : "Online";

  return {
    thread: thinking
      ? [...history, ...derived, ...answers, { id: "thinking", kind: "typing", text: "Thinking" }]
      : [...history, ...derived, ...answers],
    question,
    status,
    value,
    setValue,
    submit,
    ask,
    pickExample,
    newSearch,
    ready,
  };
}

/* ---------- Rendering ---------- */

function AgentRow({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex items-start gap-2 motion-safe:animate-pop">
      <BrandMark className="mt-0.5 size-7" />
      <div className={`min-w-0 rounded-2xl rounded-tl-md bg-raised px-3.5 py-2.5 text-sm ${wide ? "flex-1" : "max-w-[88%]"}`}>
        {children}
      </div>
    </div>
  );
}

function BestMessage({ msg, onNavigate }: { msg: Extract<Msg, { kind: "best" }>; onNavigate?: () => void }) {
  const [why, setWhy] = useState(false);
  const whyId = useId();
  return (
    <AgentRow wide>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Trophy className="size-3.5" aria-hidden="true" />
        Best deal
      </p>
      <p className="mt-1.5 flex items-center gap-2">
        <StoreMark id={msg.storeId} name={msg.storeName} size="sm" decorative />
        <span className="min-w-0 flex-1 truncate font-semibold">{msg.storeName}</span>
        <span className="text-base font-bold tabular-nums">{formatSek(msg.price)}</span>
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          size="xs"
          variant="ink"
          onClick={() => {
            navigate({ name: "offer", id: msg.offerId });
            onNavigate?.();
          }}
        >
          See it
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
        {msg.why ? (
          <Button size="xs" aria-expanded={why} aria-controls={whyId} onClick={() => setWhy((v) => !v)}>
            {why ? "Hide why" : "Why?"}
          </Button>
        ) : null}
      </div>
      {msg.why ? (
        <div id={whyId} hidden={!why} className="mt-3 border-t pt-3">
          <SafeMarkdown className="text-sm">{msg.why}</SafeMarkdown>
        </div>
      ) : null}
    </AgentRow>
  );
}

function MessageView({ msg, onNavigate }: { msg: Msg; onNavigate?: () => void }) {
  switch (msg.kind) {
    case "user":
      return (
        <div className="flex justify-end motion-safe:animate-pop">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm break-words text-white">
            {msg.text}
          </p>
        </div>
      );
    case "agent":
      return (
        <AgentRow>
          <p className="break-words">{msg.text}</p>
        </AgentRow>
      );
    case "typing":
      return (
        <AgentRow>
          <span className="flex items-center gap-2">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 160, 320].map((d) => (
                <span
                  key={d}
                  className="size-1.5 rounded-full bg-ink motion-safe:animate-typing"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
            <span className="text-muted">{msg.text}</span>
          </span>
        </AgentRow>
      );
    case "plan":
      return (
        <AgentRow wide>
          <p>I'll check {msg.stores.length} stores, each in its own locked sandbox.</p>
          <ul className="mt-2.5 flex flex-wrap gap-1" aria-label="Stores">
            {msg.stores.map((s, i) => (
              <li key={s.id} className="motion-safe:animate-pop" style={{ animationDelay: `${i * 40}ms` }}>
                <StoreMark id={s.id} name={s.name} size="xs" />
              </li>
            ))}
          </ul>
        </AgentRow>
      );
    case "progress": {
      const pct = msg.total ? Math.round((msg.finished / msg.total) * 100) : 0;
      const done = msg.finished === msg.total;
      return (
        <AgentRow wide>
          <p className="flex items-center justify-between gap-3">
            <span>{done ? `All ${msg.total} sandboxes finished.` : `Searching ${msg.total} stores…`}</span>
            <span className="font-mono text-xs text-muted tabular-nums">
              {msg.finished}/{msg.total}
            </span>
          </p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-well inset-shadow-well" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-700 ease-glide"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          </span>
        </AgentRow>
      );
    }
    case "security": {
      const Icon = msg.blocked ? ShieldCheck : ShieldExclamationPoint;
      return (
        <div
          className={`ml-9 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs motion-safe:animate-pop ${
            msg.blocked ? "border-safe/30 bg-safe/5" : "border-danger/40 bg-danger/5"
          }`}
        >
          <Icon className={`mt-px size-3.5 shrink-0 ${msg.blocked ? "text-safe" : "text-danger"}`} aria-hidden="true" />
          <p className="min-w-0">
            <span className="font-semibold">{msg.what}</span>
            <span className={`block ${msg.blocked ? "text-safe" : "text-danger"}`}>
              {msg.blocked ? `Stopped by the ${msg.layer.toLowerCase()}` : `Got past the ${msg.layer.toLowerCase()}`}
            </span>
          </p>
        </div>
      );
    }
    case "best":
      return <BestMessage msg={msg} onNavigate={onNavigate} />;
  }
}

function QuestionView({ q }: { q: Question }) {
  const compact = q.options.length > 3;
  return (
    <AgentRow wide>
      <p className="break-words">{q.text}</p>
      <div className={`mt-2.5 flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
        {q.options.map((o) => (
          <Button
            key={o.label}
            size={compact ? "sm" : "xs"}
            variant={o.primary ? "primary" : "secondary"}
            className={compact ? "min-w-8" : ""}
            onClick={o.onPick}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </AgentRow>
  );
}

function Composer({ conv }: { conv: Conversation }) {
  const { registerQueryInput } = useHuntActions();
  const inputId = useId();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    conv.submit();
  };
  const canSend = conv.ready && conv.value.trim().length > 0;
  return (
    <form onSubmit={onSubmit} className="relative">
      <label htmlFor={inputId} className="sr-only">
        Message blackbear
      </label>
      <input
        id={inputId}
        ref={registerQueryInput}
        type="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        value={conv.value}
        onChange={(e) => conv.setValue(e.target.value)}
        placeholder="What are you hunting for?"
        className="h-12 w-full rounded-full border bg-well pr-13 pl-4 text-sm text-ink transition duration-200 inset-shadow-well placeholder:text-muted/80 hover:border-line-strong focus:border-ink focus:bg-surface"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send"
        className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-black/15 bg-accent bg-linear-to-b from-accent-hover to-accent text-on-accent shadow-accent transition duration-150 ease-press enabled:hover:shadow-accent-hover enabled:active:translate-y-[calc(-50%+1px)] enabled:active:shadow-accent-pressed disabled:opacity-40 disabled:shadow-none"
      >
        <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </form>
  );
}

/**
 * The chat panel: in the left sidebar on large screens, in a drawer on small ones.
 * `onNavigate` lets the drawer close itself when a message opens a page.
 */
export function Chat({
  conv,
  variant,
  onNavigate,
  onClose,
}: {
  conv: Conversation;
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
  /** Shown as a close button in the drawer. */
  onClose?: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const last = conv.thread.at(-1);
  const lastKey = `${conv.thread.length}:${last?.id}:${last?.kind === "progress" ? last.finished : ""}:${conv.question?.id ?? ""}`;

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    log.scrollTo({ top: log.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [lastKey]);

  return (
    <section
      aria-label="Chat with blackbear"
      className={`flex flex-col overflow-hidden bg-surface ${
        variant === "sidebar" ? "h-full rounded-[1.75rem] border shadow-card" : "h-full"
      }`}
    >
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <BrandMark className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">blackbear agent</p>
          <p className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            <span className="size-1.5 rounded-full bg-safe" aria-hidden="true" />
            {conv.status}
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={Plus} onClick={conv.newSearch}>
          New
        </Button>
        {onClose ? <Button variant="ghost" size="sm" iconOnly icon={X} aria-label="Close chat" onClick={onClose} /> : null}
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        <AgentRow>
          <p>Hi! Tell me what you're hunting for. I'll check every store and bring back proof.</p>
        </AgentRow>
        {conv.thread.map((m) => (
          <MessageView key={m.id} msg={m} onNavigate={onNavigate} />
        ))}
        {conv.question ? <QuestionView key={conv.question.id} q={conv.question} /> : null}
      </div>

      <div className="border-t p-3">
        <Composer conv={conv} />
      </div>
    </section>
  );
}
