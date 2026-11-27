import { Box, Cpu, FlaskConical, Server, type LucideIcon } from "lucide-react";
import { USE_MOCK } from "../lib/env";
import { useHuntState } from "../state/HuntContext";
import { Pill } from "./ui";

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--color-surface)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="var(--color-line-strong)" />
      <path d="M10.5 7.5V23" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="15.25" cy="18.25" r="4.75" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" />
      <circle cx="23.5" cy="9.5" r="2.5" fill="var(--color-accent)" />
    </svg>
  );
}

function StatusItem({
  icon,
  label,
  value,
  loading,
  title,
}: {
  icon: LucideIcon;
  label?: string;
  value: string;
  loading?: boolean;
  title?: string;
}) {
  return (
    <Pill as="li" icon={icon} className="bg-surface shadow-card" title={title}>
      {label ? <span>{label}</span> : null}
      <span className={`truncate font-mono ${loading ? "" : "text-ink"}`}>{value}</span>
    </Pill>
  );
}

export function Header() {
  const { config, configStatus, configError } = useHuntState();
  const loading = configStatus === "loading";
  const failed = configStatus === "error";
  const placeholder = loading ? "loading…" : failed ? "unavailable" : "";

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="leading-tight">
            <h1 className="text-lg font-semibold tracking-tight">blackbear</h1>
            <p className="text-sm text-muted">Proof, not promises.</p>
          </div>
        </div>

        <ul className="flex min-w-0 flex-wrap gap-2 sm:ml-auto" aria-label="System status">
          <StatusItem icon={Cpu} label="Model" value={config?.model ?? placeholder} loading={!config} />
          <StatusItem icon={Box} label="Sandbox" value={config?.runtime ?? placeholder} loading={!config} />
          <StatusItem
            icon={Server}
            value={failed ? "Backend unreachable" : "Running on Vultr"}
            loading={loading}
            title={failed ? (configError ?? undefined) : "Agents run in isolated sandboxes on Vultr"}
          />
          {USE_MOCK ? (
            <StatusItem
              icon={FlaskConical}
              value="Mock replay"
              title="VITE_USE_MOCK=true: a scripted hunt is replayed in the browser, no backend involved"
            />
          ) : null}
        </ul>
      </div>
    </header>
  );
}
