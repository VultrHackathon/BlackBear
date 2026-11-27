import { FlaskConical, Lock, Maximize2, ShieldExclamationPoint, Timer } from "lucide-react";
import { memo, useId } from "react";
import type { StoreRun } from "../state/huntReducer";
import type { StoreConfig } from "../types";
import { ActionLine, ActionTicks, describeAlert, Elapsed, Monitor, STATUS_META, StatusLabel } from "./Monitor";
import { Led } from "./ui";

/**
 * One sandbox as a small glass monitor: status light and name, the screen, a
 * readout of the last three actions, and a strip with one mark per action.
 *
 * The whole tile is one button that opens the larger view, so nothing inside it is
 * interactive and there are no hover tooltips: the larger view shows every text in full.
 *
 * Memoised: `run` and `store` keep their identity until they change, so a stream
 * event for one sandbox does not re-render the others.
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
  const lastActions = run.actions.slice(-3);
  const lastStep = run.actions.at(-1)?.step;

  const alert = run.alert;
  const alertText = describeAlert(alert);
  const blocked = run.status === "blocked";
  const flagged = blocked || alert !== null;

  return (
    <article
      aria-label={`${name} sandbox, ${meta.label}`}
      className={`relative flex min-w-0 flex-col gap-2.5 rounded-xl border bg-raised bg-linear-to-b from-ink/4 to-transparent to-40% p-3 shadow-key transition duration-200 hover:shadow-key-hover motion-safe:animate-rise ${
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
        className="absolute inset-0 z-10 rounded-xl"
      />

      {blocked ? (
        <span className="hazard pointer-events-none absolute inset-x-3 top-0 h-1 rounded-b-sm" aria-hidden="true" />
      ) : null}

      {alert ? (
        <span
          key={alert.seq}
          className="pointer-events-none absolute -inset-px animate-flash rounded-xl bg-danger/10 ring-2 ring-danger"
          aria-hidden="true"
        />
      ) : null}

      <header className="min-w-0 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Led state={waiting ? "off" : meta.led} />
          <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{name}</span>
            {store?.honeypot ? (
              <FlaskConical className="size-3.5 shrink-0 text-muted" aria-label="Honeypot" role="img" />
            ) : null}
          </h3>
          <Maximize2 className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-2xs text-muted">
          <StatusLabel status={run.status} id={statusId} />
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3" aria-hidden="true" />
            <span className="sr-only">Elapsed</span>
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

      <ol
        className="min-h-[4.9rem] rounded-md border bg-well px-2 py-1.5 font-mono text-2xs leading-[1.35rem] inset-shadow-well"
        aria-label={`Last actions in ${name}`}
      >
        {lastActions.length === 0 ? (
          <li className="text-muted">
            {waiting ? "waiting for approval" : run.status === "queued" ? "queued" : "no actions yet"}
          </li>
        ) : (
          lastActions.map((a, i) => (
            <ActionLine key={a.key} entry={a} caret={working && i === lastActions.length - 1} />
          ))
        )}
      </ol>

      {alertText ? (
        <div className="flex gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
          <ShieldExclamationPoint className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <p className="line-clamp-3 min-w-0 break-words">
            <span className="sr-only">Blocked: </span>
            {alertText}
          </p>
        </div>
      ) : run.message ? (
        <p className="line-clamp-2 text-xs text-muted">{run.message}</p>
      ) : null}

      <footer className="mt-auto space-y-2">
        <ActionTicks actions={run.actions} />
        <div className="flex items-center justify-between gap-2 font-mono text-2xs text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <Lock className="size-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">Locked to</span>
            <span className="truncate">{domain}</span>
          </span>
          {lastStep != null ? (
            <span className="shrink-0 tabular-nums">step {String(lastStep).padStart(2, "0")}</span>
          ) : null}
        </div>
      </footer>
    </article>
  );
});
