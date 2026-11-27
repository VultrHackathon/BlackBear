import { FlaskConical, Minus, Plus, Search } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { USE_MOCK } from "../lib/env";
import { membershipName } from "../lib/membership";
import { useHuntActions, useHuntState } from "../state/HuntContext";
import { Button, card, ErrorNote, inputClass, Pill, SectionHeader, ToggleChip } from "./ui";

const MIN_QTY = 1;
const MAX_QTY = 6;

const EXAMPLES: { label: string; query: string; quantity: number }[] = [
  { label: "65-inch OLED TV", query: "65-inch OLED TV", quantity: 1 },
  { label: "Saffran 0,5 g × 2", query: "Saffran 0,5 g", quantity: 2 },
];

export function HuntForm() {
  const state = useHuntState();
  const { startHunt, registerQueryInput } = useHuntActions();
  const { config, phase } = state;

  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [budget, setBudget] = useState("");
  const [memberships, setMemberships] = useState<string[]>([]);
  const [storeIds, setStoreIds] = useState<string[] | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const ids = {
    query: useId(),
    qty: useId(),
    qtyHelp: useId(),
    budget: useId(),
    budgetHelp: useId(),
    memberships: useId(),
    stores: useId(),
    error: useId(),
  };

  // All stores are selected by default once config arrives.
  const allStoreIds = config?.stores.map((s) => s.id) ?? [];
  useEffect(() => {
    if (config && storeIds === null) setStoreIds(config.stores.map((s) => s.id));
  }, [config, storeIds]);
  const selectedStores = storeIds ?? allStoreIds;

  const busy = phase === "creating";
  const trimmed = query.trim();
  const budgetNumber = budget.trim() === "" ? null : Number(budget.replace(/\s/g, "").replace(",", "."));
  const budgetInvalid = budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber <= 0);

  const errors: string[] = [];
  if (!trimmed) errors.push("Tell us what to hunt for.");
  if (budgetInvalid) errors.push("Budget must be a positive number of kronor.");
  if (config && selectedStores.length === 0) errors.push("Select at least one store.");
  const showErrors = submitted && errors.length > 0;

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.length || !config || busy) return;
    setSubmitted(false);
    void startHunt({
      query: trimmed.slice(0, 200),
      quantity,
      budget_sek: budgetNumber === null ? null : Math.round(budgetNumber),
      memberships,
      store_ids: selectedStores,
    });
  };

  const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(MIN_QTY, Math.round(n) || MIN_QTY));

  return (
    <section aria-labelledby="hunt-heading" className={`${card} p-4 sm:p-5`}>
      <SectionHeader
        step="01"
        id="hunt-heading"
        title="Hunt"
        description="One product, about ten Swedish stores, a screenshot for every price."
      />

      <form className="mt-4 space-y-5" onSubmit={onSubmit} noValidate aria-describedby={showErrors ? ids.error : undefined}>
        {/* Query + submit */}
        <div>
          <label htmlFor={ids.query} className="mb-1.5 block text-sm font-medium">
            What are you hunting for?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id={ids.query}
                ref={registerQueryInput}
                type="text"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                maxLength={200}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="65-inch OLED TV"
                aria-invalid={submitted && !trimmed ? true : undefined}
                className={`${inputClass} h-11 w-full rounded-lg pr-3 pl-10 text-base`}
              />
            </div>
            <Button type="submit" variant="primary" size="lg" icon={Search} loading={busy} disabled={!config}>
              {busy ? "Starting…" : "Start hunt"}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>Try:</span>
            {EXAMPLES.map((ex) => (
              <Button
                key={ex.label}
                size="xs"
                onClick={() => {
                  setQuery(ex.query);
                  setQuantity(ex.quantity);
                }}
              >
                {ex.label}
              </Button>
            ))}
            {USE_MOCK ? (
              <span className="inline-flex items-center gap-1">
                <FlaskConical className="size-3" aria-hidden="true" />
                Mock mode: queries with “saffran” replay the pharmacy hunt; anything else replays the TV hunt.
              </span>
            ) : null}
          </div>
        </div>

        {/* Quantity + budget */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.qty} className="mb-1.5 block text-sm font-medium">
              Quantity
            </label>
            {/* One joined control: − | value | +. Each part keeps its own corners so its focus ring is whole. */}
            <div className="flex items-center">
              <Button
                iconOnly
                icon={Minus}
                aria-label="Decrease quantity"
                className="rounded-r-none focus-visible:z-10"
                onClick={() => setQuantity((q) => clampQty(q - 1))}
                disabled={quantity <= MIN_QTY}
              />
              <input
                id={ids.qty}
                type="number"
                inputMode="numeric"
                min={MIN_QTY}
                max={MAX_QTY}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(clampQty(Number(e.target.value)))}
                aria-describedby={ids.qtyHelp}
                className={`${inputClass} relative -mx-px h-10 w-16 text-center font-mono text-base tabular-nums focus:z-10`}
              />
              <Button
                iconOnly
                icon={Plus}
                aria-label="Increase quantity"
                className="rounded-l-none focus-visible:z-10"
                onClick={() => setQuantity((q) => clampQty(q + 1))}
                disabled={quantity >= MAX_QTY}
              />
            </div>
            <p id={ids.qtyHelp} className="mt-1.5 text-xs text-muted">
              1–6. It matters for multi-buy offers like “3 för 2” or “2 för 49 kr”.
            </p>
          </div>

          <div>
            <label htmlFor={ids.budget} className="mb-1.5 block text-sm font-medium">
              Max budget <span className="font-normal text-muted">(SEK, optional)</span>
            </label>
            <div className="relative">
              <input
                id={ids.budget}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d\s,.]/g, "").slice(0, 12))}
                placeholder="No limit"
                aria-describedby={ids.budgetHelp}
                aria-invalid={submitted && budgetInvalid ? true : undefined}
                className={`${inputClass} h-10 w-full rounded-lg pr-10 pl-3 font-mono text-base tabular-nums placeholder:font-sans`}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted" aria-hidden="true">
                kr
              </span>
            </div>
            <p id={ids.budgetHelp} className="mt-1.5 text-xs text-muted">
              Total incl. shipping. Offers above it are flagged, not hidden.
            </p>
          </div>
        </div>

        {/* Memberships */}
        <fieldset>
          <legend id={ids.memberships} className="mb-1.5 text-sm font-medium">
            Memberships you have
          </legend>
          <p className="mb-2 text-xs text-muted">Member-only prices are only counted for clubs you select.</p>
          {config ? (
            config.memberships.length ? (
              <div className="flex flex-wrap gap-2">
                {config.memberships.map((m) => (
                  <ToggleChip
                    key={m}
                    pressed={memberships.includes(m)}
                    onToggle={() => setMemberships((list) => toggle(list, m))}
                    title={`Member prices for ${membershipName(m)}`}
                  >
                    {m}
                  </ToggleChip>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No membership programs configured.</p>
            )
          ) : (
            <ChipSkeleton count={3} />
          )}
        </fieldset>

        {/* Stores */}
        <fieldset>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <legend id={ids.stores} className="text-sm font-medium">
              Stores{" "}
              <span className="font-normal text-muted">
                ({selectedStores.length} of {allStoreIds.length} selected)
              </span>
            </legend>
            {config ? (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setStoreIds(allStoreIds)}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStoreIds([])}>
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
          <p className="mb-2 text-xs text-muted">The planner picks the stores that carry your product.</p>
          {config ? (
            <div className="flex flex-wrap gap-2">
              {config.stores.map((s) => (
                <ToggleChip
                  key={s.id}
                  pressed={selectedStores.includes(s.id)}
                  onToggle={() => setStoreIds((list) => toggle(list ?? allStoreIds, s.id))}
                  title={`${s.domain}${s.honeypot ? ", our own honeypot shop for the red team" : ""}`}
                >
                  {s.name}
                  {s.honeypot ? (
                    <Pill size="xs" icon={FlaskConical} className="border-line-strong">
                      honeypot
                    </Pill>
                  ) : null}
                </ToggleChip>
              ))}
            </div>
          ) : state.configStatus === "error" ? (
            <ErrorNote>Couldn't load stores: {state.configError}</ErrorNote>
          ) : (
            <ChipSkeleton count={8} />
          )}
        </fieldset>

        {showErrors ? (
          <ul id={ids.error} role="alert" className="space-y-1 text-sm text-ink">
            {errors.map((err) => (
              <li key={err} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-ink" aria-hidden="true" />
                {err}
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </section>
  );
}

function ChipSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="h-8 w-28 animate-pulse rounded-full border bg-raised" />
      ))}
    </div>
  );
}
