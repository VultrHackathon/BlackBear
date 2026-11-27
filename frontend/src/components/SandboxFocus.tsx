import { ChevronLeft, ChevronRight, FlaskConical, Lock, ShieldExclamationPoint, Timer } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useHuntState } from "../state/HuntContext";
import { Modal } from "./Modal";
import { ActionLine, ActionTicks, describeAlert, Elapsed, Monitor, STATUS_META, StatusLabel } from "./Monitor";
import { Button, Led, Pill } from "./ui";

/**
 * The larger view of one sandbox: a big live screen, the full action log, and the
 * details a tile has no room for. It reads the live state by store id, so it keeps
 * updating while open. Previous / Next (or the arrow keys) step through the sandboxes
 * without closing it.
 */
export function SandboxFocus({
  storeId,
  onNavigate,
  onClose,
}: {
  storeId: string;
  onNavigate: (storeId: string) => void;
  onClose: () => void;
}) {
  const { stores, storeOrder, config, offers, phase } = useHuntState();
  const run = stores[storeId];
  const logRef = useRef<HTMLOListElement>(null);
  const actionCount = run?.actions.length ?? 0;
  const lastKey = run?.actions.at(-1)?.key;

  // Keep the newest log line in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [storeId, actionCount, lastKey]);

  if (!run) return null;

  const store = config?.stores.find((s) => s.id === storeId);
  const name = store?.name ?? storeId;
  const domain = store?.domain ?? "unknown domain";
  const meta = STATUS_META[run.status];
  const waiting = phase === "awaiting_approval";
  const working = !waiting && (meta.live === true || run.status === "starting");
  const captured = Object.values(offers).some((o) => o.store_id === storeId);
  const alert = run.alert;
  const alertText = describeAlert(alert);
  const lastStep = run.actions.at(-1)?.step;

  const index = storeOrder.indexOf(storeId);
  const total = storeOrder.length;
  const step = (delta: number) => {
    const next = storeOrder[(index + delta + total) % total];
    if (next && next !== storeId) onNavigate(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  };

  return (
    <Modal
      wide
      dark
      eyebrow={`Sandbox ${index + 1} of ${total}`}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {name}
          {store?.honeypot ? (
            <Pill size="xs" icon={FlaskConical}>
              honeypot
            </Pill>
          ) : null}
        </span>
      }
      closeLabel="Close sandbox details"
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      {/* The page behind a modal is inert, so its live regions are silent. This one speaks instead. */}
      <p className="sr-only" role="status" aria-live="polite">
        {name}: {meta.label}.{alertText ? ` ${alertText}.` : ""}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-3">
          {/* Keyed by store: each store counts its screenshots from 1, so frames must not carry over. */}
          <Monitor
            key={storeId}
            large
            frame={run.frame}
            rejected={run.rejectedScreenshots}
            status={run.status}
            alt={`Latest screenshot from the ${name} sandbox`}
            standby={waiting}
            captured={captured}
            bootLine={run.message}
          />
          <div className="flex items-center justify-between gap-3">
            <Button icon={ChevronLeft} onClick={() => step(-1)} disabled={total < 2}>
              Previous
            </Button>
            <p className="hidden text-xs text-muted sm:block">Use the arrow keys to switch sandbox.</p>
            <Button onClick={() => step(1)} disabled={total < 2}>
              Next
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Led state={waiting ? "off" : meta.led} />
            <StatusLabel status={run.status} large />
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted">
              <Timer className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Elapsed</span>
              <Elapsed startedAt={run.startedAt} endedAt={run.endedAt} />
            </span>
            {lastStep != null ? (
              <span className="font-mono text-xs text-muted tabular-nums">step {String(lastStep).padStart(2, "0")}</span>
            ) : null}
          </div>

          {alertText ? (
            <div className="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <ShieldExclamationPoint className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium break-words">{alertText}</p>
                {alert && alert.reason !== alertText ? (
                  <p className="mt-1 font-mono text-2xs break-words">{alert.reason}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {run.message ? <p className="text-sm text-muted">{run.message}</p> : null}

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Can reach</dt>
            <dd className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs">
              <Lock className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span className="break-all">{domain}</span>
              <span className="font-sans text-muted">only</span>
            </dd>
            {config?.runtime ? (
              <>
                <dt className="text-muted">Runtime</dt>
                <dd className="font-mono text-xs break-words">{config.runtime}</dd>
              </>
            ) : null}
          </dl>

          <section>
            <h3 className="text-sm font-medium">Action log</h3>
            <p className="mt-0.5 mb-2 text-xs text-muted">
              One mark per action, red when the action was blocked. The last 20 are kept.
            </p>
            <ActionTicks actions={run.actions} />
            <ol
              ref={logRef}
              tabIndex={0}
              aria-label={`Actions in ${name}, oldest first`}
              aria-live="off"
              className="mt-2 max-h-72 min-h-24 space-y-0.5 overflow-y-auto rounded-xl border bg-well px-3 py-2 font-mono text-xs leading-6 inset-shadow-well"
            >
              {run.actions.length === 0 ? (
                <li className="text-muted">
                  {waiting ? "waiting for approval" : run.status === "queued" ? "queued" : "no actions yet"}
                </li>
              ) : (
                run.actions.map((a, i) => (
                  <ActionLine key={a.key} entry={a} detailed caret={working && i === run.actions.length - 1} />
                ))
              )}
            </ol>
          </section>
        </div>
      </div>
    </Modal>
  );
}
