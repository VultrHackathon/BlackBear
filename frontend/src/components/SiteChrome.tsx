import { Calculator, ChevronRight, FlaskConical, Hand, Lock, Receipt, Scale, Search, ShieldCheck, ShoppingCart, Tags } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { USE_MOCK } from "../lib/env";
import { href, type Route } from "../lib/router";
import { useHuntState } from "../state/HuntContext";
import { useShop } from "../state/ShopContext";
import { BrandMark } from "./BrandMark";
import { StoreMark } from "./StoreMark";

function NavLink({
  to,
  current,
  icon: Icon,
  label,
  count,
}: {
  to: Route;
  current: Route;
  icon: typeof Tags;
  label: string;
  count?: number;
}) {
  const on = current.name === to.name || (to.name === "results" && current.name === "offer");
  return (
    <a
      href={href(to)}
      aria-current={on ? "page" : undefined}
      className={`relative inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
        on ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
      }`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden md:inline">{label}</span>
      {count ? (
        <span className="grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-extrabold text-on-accent tabular-nums">
          {count}
          <span className="sr-only"> in {label.toLowerCase()}</span>
        </span>
      ) : null}
    </a>
  );
}

/**
 * The team mockup's header: logo, a search box that hands the query to the agent,
 * and the shop's pages. Then a strip with what makes the prices trustworthy.
 */
export function SiteHeader({ route, onSearch }: { route: Route; onSearch: (q: string) => void }) {
  const { compare } = useHuntState();
  const { cartCount, setMiniOpen } = useShop();
  const [q, setQ] = useState("");
  const inputId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    onSearch(q);
    setQ("");
  };
  return (
    <>
      <header className="sticky top-0 z-40 bg-ink text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <a href={href({ name: "home" })} className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="blackbear home">
            <BrandMark className="size-9 ring-1 ring-white/15" />
            <span className="text-lg font-extrabold tracking-[-0.03em]">
              blackbear <span className="hidden text-xs font-medium tracking-normal text-white/55 lg:inline">deal hunter</span>
            </span>
          </a>
          <form onSubmit={submit} role="search" className="hidden h-10 min-w-0 flex-1 overflow-hidden rounded-lg bg-white sm:flex md:max-w-xl">
            <label htmlFor={inputId} className="sr-only">
              Search a product across Swedish stores
            </label>
            <input
              id={inputId}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={200}
              autoComplete="off"
              placeholder="Search a product across Swedish stores…"
              className="min-w-0 flex-1 bg-white px-3.5 text-sm text-[#141414] placeholder:text-[#63625e]"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 bg-accent px-4 text-sm font-bold text-on-accent transition hover:bg-accent-hover"
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Hunt</span>
            </button>
          </form>
          <nav aria-label="Shop" className="ml-auto flex shrink-0 items-center gap-1">
            <NavLink to={{ name: "results" }} current={route} icon={Tags} label="Results" />
            <NavLink to={{ name: "compare" }} current={route} icon={Scale} label="Compare" count={compare.length} />
            <NavLink to={{ name: "safety" }} current={route} icon={ShieldCheck} label="Safety" />
            <button
              type="button"
              onClick={() => setMiniOpen(true)}
              className="relative inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-white/70 transition-colors hover:bg-white/8 hover:text-white"
            >
              <ShoppingCart className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden md:inline">Cart</span>
              {cartCount ? (
                <span className="grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-extrabold text-on-accent tabular-nums">
                  {cartCount}
                  <span className="sr-only"> items</span>
                </span>
              ) : null}
            </button>
          </nav>
        </div>
      </header>
      <div className="bg-[#22252b] text-xs text-white/70">
        <ul className="mx-auto flex h-9 max-w-[1440px] items-center gap-6 overflow-x-auto px-4 whitespace-nowrap sm:px-6" aria-label="How prices are checked">
          {[
            { icon: Lock, text: "Every price read in an", strong: "isolated sandbox" },
            { icon: Receipt, text: "Checked against the", strong: "real cart" },
            { icon: Calculator, text: "Maths done by", strong: "code, not the AI" },
            { icon: Hand, text: "blackbear", strong: "never pays for you" },
          ].map((c) => (
            <li key={c.strong} className="flex items-center gap-1.5">
              <c.icon className="size-3.5 text-accent" aria-hidden="true" />
              {c.text} <b className="font-semibold text-white">{c.strong}</b>
            </li>
          ))}
          {USE_MOCK ? (
            <li
              className="ml-auto flex items-center gap-1.5"
              title="VITE_USE_MOCK=true: a scripted hunt is replayed in the browser, no backend involved"
            >
              <FlaskConical className="size-3.5" aria-hidden="true" />
              Mock replay
            </li>
          ) : null}
        </ul>
      </div>
    </>
  );
}

/** "Home › Results › NetOnNet" */
export function Crumbs({ trail }: { trail: { label: string; to?: Route }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {trail.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5" aria-hidden="true" /> : null}
            {c.to ? (
              <a href={href(c.to)} className="rounded-sm text-ink underline-offset-2 hover:underline">
                {c.label}
              </a>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A page title with an optional line under it. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.03em] sm:text-3xl">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

/** The stores blackbear searches, as small marks. The honeypot is ours, not a store. */
export function SiteFooter() {
  const { config } = useHuntState();
  const stores = config?.stores.filter((s) => !s.honeypot) ?? [];
  return (
    <footer className="mt-16 border-t bg-surface">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
        {stores.length ? (
          <>
            <h2 className="text-center text-xs font-medium text-muted">Searching across</h2>
            <ul className="mt-4 flex flex-wrap justify-center gap-2.5" aria-label="Stores blackbear searches">
              {stores.map((s) => (
                <li key={s.id}>
                  <StoreMark
                    id={s.id}
                    name={s.name}
                    size="md"
                    className="transition duration-200 ease-glide hover:-translate-y-0.5"
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-xs text-muted">
          <span className="flex items-center gap-2">
            <BrandMark className="size-5" />
            blackbear · Proof, not promises.
          </span>
          <span>Vultr Agent Runtime Hackathon · Stockholm</span>
        </div>
      </div>
    </footer>
  );
}
