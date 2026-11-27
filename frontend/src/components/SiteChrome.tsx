import { FlaskConical } from "lucide-react";
import { USE_MOCK } from "../lib/env";
import { useHuntState } from "../state/HuntContext";
import { BrandMark } from "./BrandMark";
import { StoreMark } from "./StoreMark";

/** A thin black announcement bar, then the logo. Nothing else competes with the chat. */
export function SiteHeader() {
  const { config } = useHuntState();
  const stores = config?.stores.filter((s) => !s.honeypot).length;
  return (
    <header>
      <div className="bg-ink text-white">
        <div className="mx-auto flex h-9 max-w-[1440px] items-center justify-between gap-4 px-4 text-xs sm:px-6">
          <p className="flex min-w-0 items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="truncate">Black Friday 2026 · every price comes with a screenshot</span>
          </p>
          {USE_MOCK ? (
            <p
              className="flex shrink-0 items-center gap-1.5 text-white/70"
              title="VITE_USE_MOCK=true: a scripted hunt is replayed in the browser, no backend involved"
            >
              <FlaskConical className="size-3.5" aria-hidden="true" />
              Mock replay
            </p>
          ) : null}
        </div>
      </div>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="blackbear, start over">
          <BrandMark className="size-9" />
          <span className="text-xl font-extrabold tracking-[-0.03em]">blackbear</span>
        </a>
        <p className="hidden items-center gap-5 text-sm text-muted sm:flex">
          {stores ? <span>{stores} Swedish stores</span> : null}
          <span>Sandboxed agents</span>
          <span>Proof, not promises</span>
        </p>
      </div>
    </header>
  );
}

/** The stores blackbear searches, as small marks. The honeypot is ours, not a store. */
export function SiteFooter() {
  const { config } = useHuntState();
  const stores = config?.stores.filter((s) => !s.honeypot) ?? [];
  return (
    <footer className="mt-20 border-t bg-surface">
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
