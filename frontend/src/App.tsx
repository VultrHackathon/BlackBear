import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CompareDrawer } from "./components/CompareDrawer";
import { Header } from "./components/Header";
import { HuntForm } from "./components/HuntForm";
import { MetricsBar } from "./components/MetricsBar";
import { PlanReview } from "./components/PlanReview";
import { Results } from "./components/Results";
import { SandboxGrid } from "./components/SandboxGrid";
import { SecurityScoreboard } from "./components/SecurityScoreboard";
import { useHuntState } from "./state/HuntContext";

type Tab = "hunt" | "security";
const TABS: Tab[] = ["hunt", "security"];

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Mobile/tablet only: switches between the hunt and the security scoreboard. */
function MobileTabs({ tab, onChange, attacks }: { tab: Tab; onChange: (t: Tab) => void; attacks: number }) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ hunt: null, security: null });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[next] as Tab;
    onChange(t);
    refs.current[t]?.focus();
  };

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur lg:hidden">
      <div role="tablist" aria-label="Sections" className="mx-auto flex max-w-[1600px] gap-1 px-4 sm:px-6">
        {TABS.map((t, i) => {
          const selected = tab === t;
          return (
            <button
              key={t}
              ref={(el) => {
                refs.current[t] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={selected}
              aria-controls={`panel-${t}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors ${
                selected ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t === "hunt" ? "Hunt" : "Security"}
              {t === "security" && attacks > 0 ? (
                <span className="rounded-full border border-line-strong bg-raised px-1.5 font-mono text-[11px] tabular-nums">
                  {attacks}
                  <span className="sr-only"> attacks</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const { security, compare } = useHuntState();
  const [tab, setTab] = useState<Tab>("hunt");
  const desktop = useMediaQuery("(min-width: 1024px)");

  const panel = (t: Tab) =>
    desktop ? {} : { role: "tabpanel" as const, id: `panel-${t}`, "aria-labelledby": `tab-${t}` };

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:border-line-strong focus:bg-raised focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <Header />
      <MobileTabs tab={tab} onChange={setTab} attacks={security.length} />

      <div className="mx-auto grid max-w-[1600px] items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div {...panel("hunt")} className={tab === "hunt" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <main id="main" tabIndex={-1} className="space-y-6 outline-none">
            <HuntForm />
            <PlanReview />
            <SandboxGrid />
            <Results />
          </main>
        </div>

        <aside
          {...panel("security")}
          aria-label="Security"
          className={tab === "security" ? "min-w-0" : "hidden min-w-0 lg:block"}
        >
          <div
            className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain"
            tabIndex={desktop ? 0 : undefined}
            aria-label={desktop ? "Security scoreboard, scrollable" : undefined}
            role={desktop ? "region" : undefined}
          >
            <SecurityScoreboard />
          </div>
        </aside>
      </div>

      <MetricsBar />

      {/* Room for the compare drawer so it never hides the last offer. */}
      <div
        aria-hidden="true"
        className={compare.length === 2 ? "h-[min(70vh,44rem)]" : compare.length === 1 ? "h-20" : "hidden"}
      />
      <CompareDrawer />
    </>
  );
}
