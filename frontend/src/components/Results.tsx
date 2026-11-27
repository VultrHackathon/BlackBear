import { Sparkles, Tags } from "lucide-react";
import { useHuntState } from "../state/HuntContext";
import { isHuntActive, selectRankedOffers } from "../state/huntReducer";
import { OfferCard } from "./OfferCard";
import { SafeMarkdown } from "./SafeMarkdown";
import { card, EmptyState, ErrorNote, SectionHeader, Spinner, well } from "./ui";

export function Results() {
  const state = useHuntState();
  const { offers, provisional } = selectRankedOffers(state);
  const running = isHuntActive(state.phase);
  const qty = state.request?.quantity ?? 1;
  const unit = qty === 1 ? "unit" : "units";

  const summary =
    state.phase === "idle"
      ? "No hunt yet."
      : offers.length === 0
        ? running
          ? "No offers yet. Agents are still browsing."
          : "No offers found."
        : provisional
          ? `${offers.length} ${offers.length === 1 ? "offer" : "offers"} so far, sorted by effective total. The final ranking comes when every agent is done.`
          : `${offers.length} ${offers.length === 1 ? "offer" : "offers"}, ranked best first for ${qty} ${unit}.`;

  return (
    <section aria-labelledby="results-heading" className="space-y-4">
      <div className={`${card} p-4 sm:p-5`}>
        <SectionHeader
          step="04"
          id="results-heading"
          title="Results"
          description="Ranked on the effective total: shipping, multi-buy, codes and member prices included."
        />
        <div aria-live="polite" className="mt-3 space-y-3">
          <p className="font-mono text-xs text-muted">{summary}</p>

          {state.summaryMd ? (
            <div className={`${well} p-4`}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Ranking agent
              </p>
              <SafeMarkdown className="text-sm">{state.summaryMd}</SafeMarkdown>
            </div>
          ) : running && offers.length > 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> The auditor and ranking agent are still working…
            </p>
          ) : null}

          {state.phase === "error" && state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        </div>
      </div>

      {offers.length === 0 ? (
        state.phase === "idle" ? null : (
          <EmptyState icon={Tags}>
            {running ? "Offers appear here as soon as an agent has a price with screenshot proof." : "No offers in this hunt."}
          </EmptyState>
        )
      ) : (
        <ol className="space-y-3" aria-label="Offers, best first">
          {offers.map((offer, i) => (
            <li key={offer.id}>
              <OfferCard offer={offer} rank={i + 1} provisional={provisional} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
