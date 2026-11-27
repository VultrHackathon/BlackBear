import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Chat, useConversation } from "./components/Chat";
import { HeroArt } from "./components/HeroArt";
import { ProductShelf } from "./components/ProductShelf";
import { SandboxStage } from "./components/SandboxStage";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";

/** True while the element is at least partly on screen. */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), {
      rootMargin: "-64px 0px -64px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

/**
 * One page, three steps: tell the agent what you want, watch the sandboxes, pick a
 * product. Before the first message the chat is the hero; after it, the chat
 * becomes a sticky panel beside the stage and the shelf.
 */
export default function App() {
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const conv = useConversation(includeDelivery, setIncludeDelivery);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatOnScreen = useOnScreen(chatRef);
  const started = conv.active;

  return (
    <>
      <a
        href="#chat"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to the chat
      </a>

      <SiteHeader />

      <main
        className={`mx-auto grid max-w-[1440px] px-4 sm:px-6 ${
          started
            ? "items-start gap-6 pt-2 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8"
            : "items-center gap-12 py-10 lg:min-h-[calc(100dvh-8.25rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-8"
        }`}
      >
        <div id="chat" ref={chatRef} className={`min-w-0 scroll-mt-4 ${started ? "lg:sticky lg:top-4" : ""}`}>
          {started ? null : (
            <div className="mb-8 motion-safe:animate-rise">
              <p className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-medium shadow-card">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                AI deal hunter
              </p>
              <h1 className="mt-5 text-5xl leading-[0.92] font-extrabold tracking-[-0.05em] sm:text-6xl xl:text-7xl">
                What are you
                <br />
                hunting for?
              </h1>
              <p className="mt-5 max-w-md text-lg text-muted">Tell the agent. It checks every store and brings back proof.</p>
            </div>
          )}
          <Chat conv={conv} variant={started ? "panel" : "hero"} />
        </div>

        {started ? (
          <div className="min-w-0 space-y-14">
            <SandboxStage />
            <ProductShelf includeDelivery={includeDelivery} onIncludeDelivery={setIncludeDelivery} />
          </div>
        ) : (
          <HeroArt />
        )}
      </main>

      <SiteFooter />

      {/* On small screens the chat scrolls away: bring the agent's question back to it. */}
      {conv.question && !chatOnScreen ? (
        <button
          type="button"
          onClick={() => chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="fixed inset-x-4 bottom-4 z-40 flex items-center gap-3 rounded-full bg-ink py-2 pr-4 pl-2 text-left text-sm text-white shadow-float motion-safe:animate-pop lg:hidden"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
            <MessageCircle className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">blackbear asks: </span>
            {conv.question.text}
          </span>
        </button>
      ) : null}
    </>
  );
}
