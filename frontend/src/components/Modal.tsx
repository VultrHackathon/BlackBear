import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./ui";

/**
 * Shell for a modal built on the native <dialog>: focus is trapped, the page behind
 * is inert, and Escape, the backdrop and the X all close it through the dialog's
 * own `close` event, which calls `onClose`. Mount it to open it; the parent unmounts
 * it in `onClose` and decides where focus goes next.
 */
export function Modal({
  eyebrow,
  title,
  closeLabel,
  onClose,
  onKeyDown,
  wide = false,
  dark = false,
  children,
}: {
  /** Small line above the title, e.g. "Evidence · Elgiganten". */
  eyebrow: ReactNode;
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDialogElement>) => void;
  wide?: boolean;
  /** Use the dark sandbox palette inside the dialog. */
  dark?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // No close() in a cleanup: unmounting removes the dialog from the top layer anyway,
    // and a close() here would fire onClose during StrictMode's effect re-run.
  }, []);

  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // Click on the backdrop (the dialog box itself, outside the content) closes.
        if (e.target === e.currentTarget) close();
      }}
      className={`m-auto max-h-[calc(100dvh-1.5rem)] max-w-none overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 text-ink shadow-float backdrop:bg-black/60 backdrop:backdrop-blur-sm motion-safe:animate-pop ${
        wide ? "w-[min(76rem,calc(100vw-1.5rem))]" : "w-[min(60rem,calc(100vw-1.5rem))]"
      } ${dark ? "theme-dark" : ""}`}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs text-muted">{eyebrow}</p>
            <h2 id={titleId} className="mt-0.5 text-base font-semibold break-words">
              {title}
            </h2>
          </div>
          <Button variant="ghost" iconOnly icon={X} aria-label={closeLabel} onClick={close} className="-mr-1.5" />
        </header>

        <div className="overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </dialog>
  );
}
