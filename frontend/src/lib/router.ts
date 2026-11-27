import { useEffect, useState } from "react";

/**
 * A tiny hash router: `#results`, `#offer/<id>`, … It needs no server rewrites, so it
 * works behind FastAPI's static mount, and the back button just works.
 */
export type Route =
  | { name: "home" }
  | { name: "results" }
  | { name: "offer"; id: string }
  | { name: "compare" }
  | { name: "cart" }
  | { name: "checkout" }
  | { name: "safety" };

const SIMPLE = new Set(["home", "results", "compare", "cart", "checkout", "safety"]);

export function parseHash(hash: string): Route {
  const [name = "", ...rest] = hash.replace(/^#\/?/, "").split("/");
  if (name === "offer" && rest[0]) return { name: "offer", id: decodeURIComponent(rest.join("/")) };
  if (SIMPLE.has(name)) return { name } as Route;
  return { name: "home" };
}

export function href(route: Route): string {
  return route.name === "offer" ? `#offer/${encodeURIComponent(route.id)}` : `#${route.name}`;
}

export function navigate(route: Route): void {
  const next = href(route);
  if (window.location.hash !== next) window.location.hash = next;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
