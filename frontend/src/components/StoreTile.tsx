import { FlaskConical, Lock, Maximize2, ShieldExclamationPoint } from "lucide-react";
import { memo, useId } from "react";
import type { StoreRun } from "../state/huntReducer";
import type { StoreConfig } from "../types";
import { ActionLine, ActionTicks, describeAlert, Elapsed, Monitor, STATUS_META, StatusLabel } from "./Monitor";
import { Led } from "./ui";

/**
 * One sandbox as a small glass monitor: light and name, the screen, what the agent
 * is doing right now, and one mark per action. Everything else is in the larger view.
 *
 * The whole tile is one button, so nothing inside it is interactive and there are no
 * hover tooltips. Memoised: a stream event for one sandbox does not re-render the others.
 */
export const StoreTile = memo(function StoreTile({
  run,
  store,
  waiting,
  captured,
  onOpen,
}: {
  run: StoreRun;
  store: StoreConfig | undefined;
  /** The plan is waiting for approval: sandboxes are on standby. */
  waiting: boolean;
  /** This sandbox produced an offer. */
  captured: boolean;
  onOpen: (storeId: string) => void;
}) {
  const statusId = useId();
  const name = store?.name ?? run.storeId;
  const domain = store?.domain ?? "unknown domain";
  const meta = STATUS_META[run.status];
  const working = !waiting && (meta.live === true || run.status === "starting");
  const last = run.actions.at(-1);

  const alert = run.alert;
  const alertText = describeAlert(alert);
  const blocked = run.status === "blocked";
  const flagged = blocked || alert !== null;

  return (
    <article
      aria-label={`${name} sandbox, ${meta.label}`}
      className={`group relative flex min-w-0 flex-col gap-2.5 rounded-2xl border bg-raised bg-linear-to-b from-white/5 to-transparent to-40% p-3 shadow-key transition duration-200 ease-glide hover:-translate-y-0.5 hover:shadow-key-hover motion-safe:animate-rise ${
        flagged ? "border-danger/50" : "border-line-strong/70 hover:border-line-strong"
      }`}
    >
      {/* Stretched over the tile. Its focus ring is the tile's focus ring. */}
      <button
        type="button"
        data-sandbox-open={run.storeId}
        onClick={() => onOpen(run.storeId)}
        aria-label={`Open ${name} sandbox details`}
        aria-describedby={statusId}
        aria-haspopup="dialog"
        className="absolute inset-0 z-10 rounded-2xl"
      />

      {blocked ? (
        <span className="hazard pointer-events-none absolute inset-x-4 top-0 h-1 rounded-b-sm" aria-hidden="true" />
      ) : null}

      {alert ? (
        <span
          key={alert.seq}
          className="pointer-events-none absolute -inset-px animate-flash rounded-2xl bg-danger/10 ring-2 ring-danger"
          aria-hidden="true"
        />
      ) : null}

      <header className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Led state={waiting ? "off" : meta.led} />
          <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{name}</span>
            {store?.honeypot ? (
              <FlaskConical className="size-3.5 shrink-0 text-muted" aria-label="Honeypot" role="img" />
            ) : null}
          </h3>
          <Maximize2 className="size-3.5 shrink-0 text-muted opacity-60 transition group-hover:opacity-100" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-2xs text-muted">
          <StatusLabel status={run.status} id={statusId} />
          <span>
            <span className="sr-only">Elapsed </span>
            <Elapsed startedAt={run.startedAt} endedAt={run.endedAt} />
          </span>
        </div>
      </header>

      <Monitor
        frame={run.frame}
        rejected={run.rejectedScreenshots}
        status={run.status}
        alt={`Latest screenshot from the ${name} sandbox`}
        standby={waiting}
        captured={captured}
        bootLine={run.message}
      />

      {alertText ? (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-danger">
          <ShieldExclamationPoint className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Blocked: </span>
          <span className="truncate">{alertText}</span>
        </p>
      ) : (
        <ol
          className="h-8 rounded-lg border bg-well px-2 font-mono text-2xs leading-8 inset-shadow-well"
          aria-label={`Latest action in ${name}`}
        >
          {last ? (
            <ActionLine key={last.key} entry={last} caret={working} />
          ) : (
            <li className="text-muted">{waiting ? "standby" : run.status === "queued" ? "queued" : "starting…"}</li>
          )}
        </ol>
      )}

      <footer className="mt-auto space-y-2">
        <ActionTicks actions={run.actions} />
        <p className="flex min-w-0 items-center gap-1 font-mono text-2xs text-muted">
          <Lock className="size-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">Locked to</span>
          <span className="truncate">{domain}</span>
        </p>
      </footer>
    </article>
  );
});
