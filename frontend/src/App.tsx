import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Chat, useConversation, type Conversation } from "./components/Chat";
import { MiniCart, ToastHost } from "./components/ShopOverlays";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { useRoute } from "./lib/router";
import { CartPage } from "./pages/CartPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { ComparePage } from "./pages/ComparePage";
import { HomePage } from "./pages/HomePage";
import { OfferPage } from "./pages/OfferPage";
import { ResultsPage } from "./pages/ResultsPage";
import { SafetyPage } from "./pages/SafetyPage";
import { useHuntState } from "./state/HuntContext";
import { useShop } from "./state/ShopContext";

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

/**
 * Below the large breakpoint the chat lives in a drawer: a native modal dialog that
 * slides in from the left. A floating button opens it and shows when the agent asks.
 */
function ChatDrawer({ conv }: { conv: Conversation }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const asks = conv.question !== null;
  const { phase, startedAt } = useHuntState();

  // Once a hunt starts running, step aside so the sandboxes are in view.
  const shownFor = useRef<number | null>(null);
  useEffect(() => {
    if (phase === "running" && startedAt !== shownFor.current) {
      shownFor.current = startedAt;
      setOpen(false);
    }
  }, [phase, startedAt]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed right-4 bottom-4 z-30 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full bg-ink py-2 pr-4 pl-2 text-sm text-white shadow-float motion-safe:animate-pop"
      >
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <MessageCircle className="size-4" aria-hidden="true" />
          {asks ? (
            <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white text-[0.6rem] font-extrabold text-ink ring-2 ring-ink">
              1
            </span>
          ) : null}
        </span>
        <span className="min-w-0 truncate">
          {asks ? (
            <>
              <b>blackbear asks: </b>
              {conv.question?.text}
            </>
          ) : (
            <b>Ask blackbear</b>
          )}
        </span>
      </button>
      <dialog
        ref={ref}
        aria-label="Chat with blackbear"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(26rem,100vw)] max-w-none bg-surface p-0 text-ink shadow-float backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
      >
        <Chat conv={conv} variant="drawer" onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
      </dialog>
    </>
  );
}

/**
 * The storefront: the team's mockup layout in the centre, the AI agent in a left
 * sidebar on every page (a drawer on small screens).
 */
export default function App() {
  const route = useRoute();
  const { includeDelivery, setIncludeDelivery } = useShop();
  const conv = useConversation(includeDelivery, setIncludeDelivery);
  const wide = useMediaQuery("(min-width: 1024px)");

  let page;
  switch (route.name) {
    case "results":
      page = <ResultsPage />;
      break;
    case "offer":
      page = <OfferPage key={route.id} id={route.id} />;
      break;
    case "compare":
      page = <ComparePage />;
      break;
    case "cart":
      page = <CartPage />;
      break;
    case "checkout":
      page = <CheckoutPage />;
      break;
    case "safety":
      page = <SafetyPage />;
      break;
    default:
      page = <HomePage conv={conv} />;
  }

  return (
    <>
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <SiteHeader route={route} onSearch={conv.ask} />

      <div className="mx-auto grid max-w-[1440px] items-start gap-6 px-4 pt-6 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8">
        {wide ? (
          <aside aria-label="blackbear agent" className="sticky top-[5.5rem] h-[calc(100dvh-8.25rem)]">
            <Chat conv={conv} variant="sidebar" />
          </aside>
        ) : null}
        <main id="main" tabIndex={-1} className="min-w-0 outline-none">
          {page}
        </main>
      </div>

      <SiteFooter />
      {wide ? null : <ChatDrawer conv={conv} />}
      <MiniCart />
      <ToastHost />
    </>
  );
}
