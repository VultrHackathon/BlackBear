import { ArrowRight, Bot, Calculator, Hand, Search } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { EXAMPLES, type Conversation } from "../components/Chat";
import { HeroArt } from "../components/HeroArt";
import { ProductPhoto } from "../components/ProductPhoto";
import { StoreMark } from "../components/StoreMark";
import { rankedOffers } from "../lib/deals";
import { formatSek } from "../lib/format";
import { href } from "../lib/router";
import { useHuntState } from "../state/HuntContext";

const HOW = [
  { icon: Search, title: "1 · Ask", text: "Tell the agent what you want. It plans which stores to check." },
  { icon: Bot, title: "2 · Agents shop", text: "Each store gets a fresh, sealed browser. Watch them live." },
  { icon: Calculator, title: "3 · Real totals", text: "Multi-buy, member prices and delivery, checked in the cart." },
  { icon: Hand, title: "4 · You buy", text: "Shortlist the best, then buy at the store yourself." },
];

/** The storefront's front page, after the team's mockup. Searching here talks to the agent. */
export function HomePage({ conv }: { conv: Conversation }) {
  const state = useHuntState();
  const [q, setQ] = useState("");
  const inputId = useId();
  const top = rankedOffers(state.offers, state.ranking).slice(0, 3);
  const nameOf = (id: string) => state.config?.stores.find((s) => s.id === id)?.name ?? id;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    conv.ask(q);
    setQ("");
  };

  return (
    <>
      <section className="theme-dark relative isolate grid items-center gap-8 overflow-hidden rounded-[1.75rem] bg-canvas p-6 shadow-lift sm:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div
          className="pointer-events-none absolute -top-32 -left-24 -z-10 size-[32rem] bg-[radial-gradient(closest-side,rgb(255_194_26/0.18),transparent)]"
          aria-hidden="true"
        />
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            AI deal hunter
          </p>
          <h1 className="mt-5 text-4xl leading-[1.02] font-extrabold tracking-[-0.045em] sm:text-5xl xl:text-6xl">
            The best price,
            <br />
            with proof.
          </h1>
          <p className="mt-4 max-w-md text-muted">
            Agents visit each store in a locked-down browser, put it in the cart, and show you the real total.
          </p>
          <form onSubmit={submit} className="mt-6 flex max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-float">
            <label htmlFor={inputId} className="sr-only">
              What are you hunting for?
            </label>
            <input
              id={inputId}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={200}
              autoComplete="off"
              placeholder="e.g. 65-inch OLED TV"
              className="min-w-0 flex-1 bg-white px-3 text-base text-[#141414] placeholder:text-[#63625e]"
            />
            <button
              type="submit"
              disabled={!conv.ready}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-black/15 bg-accent bg-linear-to-b from-accent-hover to-accent px-5 text-sm font-bold text-on-accent shadow-accent transition duration-150 ease-press hover:shadow-accent-hover active:translate-y-px active:shadow-accent-pressed disabled:opacity-50"
            >
              Start hunt
            </button>
          </form>
        </div>

        {top.length ? (
          <div className="rounded-2xl border border-line-strong bg-surface p-5">
            <p className="flex items-center justify-between gap-3">
              <b>Last hunt</b>
              <span className="text-xs text-muted">“{state.request?.query}”</span>
            </p>
            <ul className="mt-3 divide-y">
              {top.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <StoreMark id={o.store_id} name={nameOf(o.store_id)} size="sm" decorative />
                    {nameOf(o.store_id)}
                  </span>
                  <b className="tabular-nums">{formatSek(o.effective_total_sek)}</b>
                </li>
              ))}
            </ul>
            <a
              href={href({ name: "results" })}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-2 hover:underline"
            >
              View results
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div className="w-full max-w-[26rem] justify-self-center">
            <HeroArt />
          </div>
        )}
      </section>

      <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="How it works">
        {HOW.map((h) => (
          <li key={h.title} className="rounded-2xl border bg-surface p-4 shadow-card">
            <h.icon className="size-5 text-ink" aria-hidden="true" />
            <p className="mt-2 font-bold">{h.title}</p>
            <p className="mt-1 text-sm text-muted">{h.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold tracking-tight">Popular hunts</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {EXAMPLES.map((ex, i) => (
          <li key={ex.label}>
            <button
              type="button"
              onClick={() => conv.pickExample(i)}
              disabled={!conv.ready}
              className="group flex w-full items-center gap-4 rounded-2xl border bg-surface p-3 text-left shadow-card transition duration-200 ease-glide hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-60"
            >
              <ProductPhoto src={ex.image} alt="" storeId="" storeName="" className="aspect-square w-20 shrink-0" pad="p-2" />
              <span className="min-w-0 flex-1">
                <b className="block">{ex.label}</b>
                <span className="text-sm text-muted">{ex.stores} stores</span>
              </span>
              <ArrowRight className="mr-2 size-5 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
