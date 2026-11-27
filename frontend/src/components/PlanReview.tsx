import { Check, ChevronDown, ListChecks, Lock, Pencil, Play } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import { btnPrimary, btnSecondary, card, ErrorNote, SectionHeader, Spinner } from "./ui";

function AutoApproveSwitch() {
  const { autoApprove, phase } = useHuntState();
  const { setAutoApprove } = useHuntActions();
  const labelId = useId();
  const descId = useId();
  const midHunt = phase === "awaiting_approval" || phase === "running" || phase === "planning";
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-right">
        <span id={labelId} className="block text-sm">
          Auto-approve plans
        </span>
        <span id={descId} className="block text-xs text-muted">
          {midHunt ? "Applies to the next hunt" : "Dispatch as soon as the plan is ready"}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={autoApprove}
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={() => setAutoApprove(!autoApprove)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          autoApprove ? "border-ink bg-ink" : "border-line-strong bg-raised"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full transition-transform ${
            autoApprove ? "translate-x-6 bg-canvas" : "translate-x-1 bg-muted"
          }`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

export function PlanReview() {
  const { phase, plan, approval, approvalError, config, request } = useHuntState();
  const { approve, editQuery } = useHuntActions();
  const storeById = new Map(config?.stores.map((s) => [s.id, s]) ?? []);

  const awaiting = phase === "awaiting_approval";
  const pending = approval === "pending";
  const detailsId = useId();
  // Once dispatched, the plan folds away so the live grid is visible; it can be reopened.
  const [showPlan, setShowPlan] = useState(false);
  useEffect(() => setShowPlan(false), [plan]);
  const collapsible = plan !== null && !awaiting;
  const expanded = !collapsible || showPlan;
  const status =
    phase === "planning" || phase === "creating"
      ? "The planner is drafting criteria and a search query for each store…"
      : awaiting
        ? `Plan ready: ${plan?.tasks.length ?? 0} stores. Review it, then approve to dispatch the browser agents.`
        : approval === "auto" && plan
          ? "Auto-approved. Browser agents dispatched."
          : approval === "approved" && plan
            ? "Approved. Browser agents dispatched."
            : "";

  return (
    <section aria-labelledby="plan-heading" className={`${card} p-4 sm:p-5`}>
      <SectionHeader
        step="02"
        id="plan-heading"
        title="Plan review"
        description="Nothing is dispatched until you approve the planner's plan."
      >
        <AutoApproveSwitch />
      </SectionHeader>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {phase === "idle" || (phase === "error" && !plan) ? (
        <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Start a hunt and the planner proposes its criteria and one search query per store.
        </p>
      ) : !plan ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Planner is drafting a plan for “{request?.query}”…
          </p>
          {[72, 58, 64].map((w) => (
            <div key={w} className="h-3 animate-pulse rounded bg-raised" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {collapsible ? (
            <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
              <p className="text-sm text-muted">
                {plan.tasks.length} stores · {plan.criteria.length} criteria
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
                aria-expanded={expanded}
                aria-controls={detailsId}
                onClick={() => setShowPlan((v) => !v)}
              >
                {expanded ? "Hide plan" : "Show plan"}
                <ChevronDown
                  className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          ) : null}
          <div id={detailsId} hidden={!expanded} className="contents">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ListChecks className="size-4 text-muted" aria-hidden="true" />
                Criteria
              </h3>
              <ul className="space-y-1.5 text-sm">
                {plan.criteria.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-medium">Search query per store</h3>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-raised text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Store
                      </th>
                      <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                        Sandbox can reach
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Search query
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {plan.tasks.map((task) => {
                      const store = storeById.get(task.store_id);
                      return (
                        <tr key={task.store_id}>
                          <th scope="row" className="px-3 py-2 font-medium whitespace-nowrap">
                            {store?.name ?? task.store_id}
                            {store?.honeypot ? <span className="ml-1.5 text-xs font-normal text-muted">(honeypot)</span> : null}
                          </th>
                          <td className="hidden px-3 py-2 font-mono text-xs text-muted sm:table-cell">
                            <span className="inline-flex items-center gap-1">
                              <Lock className="size-3" aria-hidden="true" />
                              {store?.domain ?? "unknown"}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs break-all">{task.search_query}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            {awaiting ? (
              <>
                <button type="button" className={btnPrimary} onClick={() => void approve()} disabled={pending}>
                  {pending ? <Spinner /> : <Play className="size-4" aria-hidden="true" />}
                  {pending ? "Dispatching…" : "Approve & dispatch"}
                </button>
                <button type="button" className={btnSecondary} onClick={editQuery} disabled={pending}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit query
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-xs">
                  <Check className="size-3.5" aria-hidden="true" />
                  {approval === "auto" ? "Auto-approved" : approval === "approved" ? "Approved" : "Plan closed"}
                </span>
                <button type="button" className={btnSecondary} onClick={editQuery}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit query
                </button>
              </>
            )}
            {approvalError ? <ErrorNote>Approve failed: {approvalError}</ErrorNote> : null}
          </div>
        </div>
      )}
    </section>
  );
}
