import { Copy, CopyCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "./ui";

/**
 * A store page address as PLAIN TEXT with a Copy button. Store content is untrusted,
 * so blackbear never turns it into a link.
 */
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const wrapRef = useRef<HTMLDivElement>(null);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Fallback inside this element, so it also works inside a modal dialog.
      const host = wrapRef.current;
      if (host) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.className = "fixed top-0 left-0 opacity-0";
        host.appendChild(ta);
        ta.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        host.removeChild(ta);
      }
    }
    setState(ok ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 2000);
  };

  return (
    <div ref={wrapRef} className="flex items-start gap-2">
      <p className="min-w-0 flex-1 rounded-lg border bg-well px-2.5 py-2 font-mono text-xs break-all select-all inset-shadow-well">
        {text || "–"}
      </p>
      <Button size="sm" icon={state === "copied" ? CopyCheck : Copy} onClick={() => void copy()} disabled={!text}>
        {state === "copied" ? "Copied" : state === "failed" ? "Failed" : label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Address copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </div>
  );
}
