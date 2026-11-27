import { ChevronDown, ChevronUp, RotateCw, Scale, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import type { CompareResponse, Offer } from "../types";
import { SafeMarkdown } from "./SafeMarkdown";
import { Button, ErrorNote, Pill, Skeleton, Spinner } from "./ui";

type CompareState =
  | { status: "loading" }
  | { status: "ready"; data: CompareResponse }
  | { status: "error"; message: string };

/**
 * Opens when exactly two offers are checked. Not modal: the results stay usable
 * behind it. Focus moves to the drawer heading on open; Escape closes it and returns
 * focus to where it was.
 */
export function CompareDrawer() {
  const { compare, offers, config } = useHuntState();
  const { clearCompare } = useHuntActions();
  const [result, setResult] = useState<CompareState>({ status: "loading" });
  const [minimized, setMinimized] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const headingId = useId();

  const [idA, idB] = compare.length === 2 ? compare : [null, null];
  const offerA: Offer | undefined = idA ? offers[idA] : undefined;
  const offerB: Offer | undefined = idB ? offers[idB] : undefined;
  const open = Boolean(offerA && offerB);

  // Fetch the comparison whenever the pair changes.
  useEffect(() => {
    if (!idA || !idB) return;
    const ctrl = new AbortController();
    setResult({ status: "loading" });
    api
      .compare(idA, idB, ctrl.signal)
      .then((data) => setResult({ status: "ready", data }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setResult({ status: "error", message: errorMessage(err) });
      });
    return () => ctrl.abort();
  }, [idA, idB, attempt]);

  // Focus management on open.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMinimized(false);
    headingRef.current?.focus();
  }, [open, idA, idB]);

  const close = useCallback(() => {
    clearCompare();
    const target = returnFocus.current;
    if (target && document.contains(target)) target.focus();
  }, [clearCompare]);

  if (compare.length === 0) return null;

  const storeName = (o: Offer | undefined) =>
    o ? (config?.stores.find((s) => s.id === o.store_id)?.name ?? o.store_id) : "";

  if (!open) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6 sm:pb-4">
        <div
          role="status"
          className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-line-strong bg-raised px-4 py-2.5 text-sm shadow-float motion-safe:animate-drawer"
        >
          <span className="flex items-center gap-2">
            <Scale className="size-4 text-muted" aria-hidden="true" />
            1 offer selected. Pick one more to compare.
          </span>
          <Button variant="ghost" size="sm" onClick={clearCompare}>
            Clear
          </Button>
        </div>
      </div>
    );
  }

  const nameA = storeName(offerA);
  const nameB = storeName(offerB);
  const data = result.status === "ready" ? result.data : null;
  const winnerName = data ? (data.winner_id === idA ? nameA : data.winner_id === idB ? nameB : null) : null;

  return (
    <section
      aria-labelledby={headingId}
      className="fixed inset-x-0 bottom-0 z-40 px-2 pb-2 sm:px-6 sm:pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="mx-auto flex max-h-[min(70vh,44rem)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-raised shadow-float motion-safe:animate-drawer">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold"
          >
            <Scale className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">
              Compare: {nameA} vs {nameB}
            </span>
          </h2>
          <div className="flex items-center gap-2" aria-live="polite">
            {result.status === "loading" ? (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Spinner className="size-3.5" /> Compare agent is weighing the offers…
              </span>
            ) : winnerName ? (
              <Pill tone="strong" icon={Trophy}>
                Winner: {winnerName}
              </Pill>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={minimized ? ChevronUp : ChevronDown}
              onClick={() => setMinimized((m) => !m)}
              aria-expanded={!minimized}
              aria-label={minimized ? "Expand comparison" : "Minimize comparison"}
            />
            <Button variant="ghost" size="sm" iconOnly icon={X} onClick={close} aria-label="Close comparison" />
          </div>
        </header>

        {minimized ? null : (
          <div className="overflow-y-auto px-4 py-4">
            {result.status === "loading" ? (
              <div className="space-y-2" aria-hidden="true">
                {[90, 76, 84, 60].map((w) => (
                  <Skeleton key={w} width={`${w}%`} />
                ))}
              </div>
            ) : result.status === "error" ? (
              <div className="flex flex-wrap items-center gap-3">
                <ErrorNote>Compare failed: {result.message}</ErrorNote>
                <Button icon={RotateCw} onClick={() => setAttempt((n) => n + 1)}>
                  Retry
                </Button>
              </div>
            ) : data ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                <SafeMarkdown className="text-sm">{data.explanation_md}</SafeMarkdown>
                <div className="min-w-0 overflow-x-auto rounded-lg border bg-canvas/50 inset-shadow-well">
                  <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Side-by-side breakdown of {nameA} and {nameB}
                    </caption>
                    <thead className="border-b bg-surface text-xs">
                      <tr>
                        <th scope="col" className="w-32 px-3 py-2 font-medium text-muted">
                          <span className="sr-only">Attribute</span>
                        </th>
                        {[
                          { id: idA, name: nameA },
                          { id: idB, name: nameB },
                        ].map((col) => (
                          <th
                            key={col.id}
                            scope="col"
                            className={`px-3 py-2 font-semibold ${data.winner_id === col.id ? "text-ink" : "text-muted"}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {data.winner_id === col.id ? <Trophy className="size-3.5" aria-label="Winner" role="img" /> : null}
                              {col.name}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.breakdown.map((row, i) => (
                        <tr key={`${row.label}-${i}`} className="align-top">
                          <th scope="row" className="px-3 py-2 text-xs font-medium whitespace-nowrap text-muted">
                            {row.label}
                          </th>
                          <td className={`px-3 py-2 tabular-nums break-words ${data.winner_id === idA ? "bg-ink/3" : ""}`}>
                            {row.a}
                          </td>
                          <td className={`px-3 py-2 tabular-nums break-words ${data.winner_id === idB ? "bg-ink/3" : ""}`}>
                            {row.b}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
