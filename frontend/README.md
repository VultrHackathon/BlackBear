# blackbear frontend

**Proof, not promises.** blackbear finds the best Black Friday deal for a product across about ten Swedish web stores. A planner agent makes a plan. Then ten browser agents run in parallel, each locked in its own Vultr sandbox that can only reach its own store. Every price comes with a screenshot. Code computes the real price (shipping, multi-buy, codes, member prices), and an auditor labels each offer Real, Questionable or Fake. A red team attacks our own honeypot shop, and a scoreboard shows the layer that stopped each attack.

Built for the Vultr Agent Runtime Hackathon, Stockholm, Black Friday 2026. This is the `frontend/` part of the BlackBear repo; the backend lives in `../backend/` and must implement the [API contract](#api-contract) below.

React 18 · TypeScript · Vite 8 · Tailwind CSS v4 · lucide-react · react-markdown. State is `useReducer` + context; there is no other UI or state library.

---

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, mock mode, no backend needed
```

All `npm` commands in this README run inside `frontend/`.

Requires Node ≥ 20.19.

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev server (mock mode by default)          |
| `npm run build`     | Type-check (`tsc -b`) and production build |
| `npm run typecheck` | Type-check only                            |
| `npm run preview`   | Serve the production build                 |

### 2-minute demo script

1. Click **Start hunt** with "65-inch OLED TV", then read the plan and click **Approve & dispatch**.
2. Watch the ten sandboxes. The **SuperDeals** honeypot tile flashes red twice: a hidden prompt injection (stopped by the injection guard) and a redirect to `evil.example.com` (stopped by the egress proxy). The security scoreboard shows 2 attempted, 2 blocked, 0% success.
3. Results: NetOnNet wins at 14 240 kr (code BLACK10 confirmed in the cart). Power's "−42%" is **Fake**: hover the badge to see why. Komplett is **Questionable**, because its cart price differs from the advertised price.
4. Open **Evidence** on any offer. The URL is plain text with a copy button, never a link.
5. Click **Re-verify** on Inet, which gets a new price, then on NetOnNet, which returns "Same price ✓".
6. Check **Compare** on two offers. The drawer explains the winner and shows a breakdown table.
7. Click the example **Saffran 0,5 g × 2** and hunt as a guest. Apotek Hjärtat's "2 för 49 kr" was not applied in a guest cart, so the effective total is 70 kr (Questionable), and Kronans wins.
8. Select **Stammis (Apotek Hjärtat)** and hunt again. Hjärtat now wins at 49 kr.

---

## Environment variables

Copy `frontend/.env.example` to `frontend/.env.local` and adjust. (The repo-root `.env.example` is for the backend.)

| Variable                 | Default                 | Meaning                                                                                                                                       |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE`          | `""`                    | Backend base URL, e.g. `https://api.blackbear.example`. Empty means same origin.                                                               |
| `VITE_USE_MOCK`          | `"true"`                | Anything except `"false"` replays the scripted hunt in the browser.                                                                            |
| `BLACKBEAR_PROXY_TARGET` | `http://localhost:8000` | Dev and preview server only: where `/api` is proxied when `VITE_API_BASE` is empty. Not exposed to the bundle. |

### Running against the FastAPI backend

Start the backend from `backend/` on port 8000 (FastAPI's default), then run the frontend against it.

**Same origin through the Vite proxy** (simplest, no CORS):

```bash
VITE_USE_MOCK=false BLACKBEAR_PROXY_TARGET=http://localhost:8000 npm run dev
```

**Separate origin**:

```bash
VITE_USE_MOCK=false VITE_API_BASE=https://api.blackbear.example npm run build
```

With a separate origin, the backend must send CORS headers for this origin, including on the SSE endpoint. The production CSP automatically allows `connect-src` and `img-src` for the `VITE_API_BASE` origin.

---

## Mock mode

`src/api/mock.ts` is a small in-browser "server" with the same surface as the REST API. It emits the same SSE event types, as JSON strings with incrementing `id`s, and those go through the same parse → validate → dedupe path as a real `EventSource`. Mock screenshots are generated SVGs served as `data:` URLs (`src/api/mockScreens.ts`), so no assets or network are needed. The mock is lazy-loaded into its own chunk.

| Query                                     | Scenario                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contains `saffran` / `saffron`            | Apotek Hjärtat, Apotea, Kronans Apotek, Apoteket, Lyko. Includes the real Hjärtat case: "Hjärtats saffran finmald 0,5 g", 35 kr, "2 för 49 kr" requiring Stammis, `applied_in_cart: false`. With quantity 2, a guest pays 70 kr (Questionable); a Stammis member pays 49 kr. |
| anything else                             | "65-inch OLED TV": Elgiganten, NetOnNet, Power, Webhallen, Inet, Komplett, CDON, Clas Ohlson, Proshop and the honeypot SuperDeals. Promos include an extra 10% with BLACK10, "3 för 2 på tillbehör" (not applied to the TV), free shipping over 499 kr, and a Webhallen member price. One **Fake** (discount measured from a price above the 30-day low), one **Questionable** (cart ≠ advertised), one **Unknown** (marketplace, no price history), one bot check (agent stops, no bypass), one no-match. |

Other details:
- A hunt takes about 25 seconds: about 2 s of planning, then about 22 s after approval.
- The mock's pricing engine is membership-aware. It applies, in order: member price → multi-buy → % / code → free-shipping threshold.
- Re-verify: Inet's price changes once (14 790 → 14 490 kr). Every other offer returns the same price.
- If none of the selected stores fit the scenario, the mock emits an `error` event.

---

## API contract

The frontend is built against this contract exactly. Clarifications on choices the contract leaves open are marked **Note**.

```
POST /api/hunts
  body {query, quantity, budget_sek|null, memberships: string[], store_ids: string[], auto_approve: boolean}
  → {hunt_id}
POST /api/hunts/{id}/approve            → 204
GET  /api/hunts/{id}/events             → text/event-stream
POST /api/offers/{offer_id}/reverify    → {offer_id, same_price, price_sek, captured_at, screenshot_url}
POST /api/compare
  body {offer_a, offer_b}
  → {winner_id, explanation_md, breakdown: {label, a, b}[]}
GET  /api/config                        → {model, runtime, stores: {id, name, domain, honeypot?}[], memberships: string[]}
```

- **Note:** `offer_a` and `offer_b` are **offer ids** (strings).
- **Note:** `memberships` holds the strings from `/api/config`, e.g. `"Stammis (Apotek Hjärtat)"`. A promo's `requires_membership: "Stammis"` matches it; the parenthesised store name is ignored.
- Errors: non-2xx responses may carry FastAPI's `{"detail": "..."}`; string details are shown to the user.

### SSE events

Each `data:` line is JSON with a `type`. Unnamed events are expected; named events (`event: store.status`) are accepted too.

```
hunt.started    {hunt_id, query}
plan.ready      {plan: {criteria: string[], tasks: {store_id, search_query}[]}}
store.status    {store_id, status, message?}     status: queued|starting|browsing|extracting|verifying|done|blocked|failed
store.action    {store_id, step, action: {type, target?, text?}, allowed, reason?}
                type: goto|click|type|scroll|extract|add_to_cart
store.screenshot{store_id, url}
offer.found     {offer: Offer}
verdict.ready   {offer_id, trust: Trust}
security.event  {store_id, kind, layer, detail, blocked}
ranking.ready   {ranking: string[], summary_md}
metrics         {llm_calls, tokens, cost_usd, sandbox_seconds}
hunt.done       {elapsed_s}
error           {message}
```

`Promo`, `Trust` and `Offer` are defined in [src/types.ts](src/types.ts), mirroring the backend models.

How the UI interprets the stream:

| Situation                                              | Behaviour                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `plan.ready` with `auto_approve: false`                | Shows the plan with **Approve & dispatch**. Store tiles appear as `queued`.                                  |
| First non-`queued` `store.status` while awaiting approval | Treated as "agents dispatched" (approved elsewhere or auto-approved).                                     |
| `store.action` with `allowed: false`                   | The tile flashes red and shows `reason`. A missing `allowed` counts as allowed.                              |
| `security.event`                                       | Added to the scoreboard and flashes the store's tile. A missing `blocked` counts as **not** blocked.         |
| `verdict.ready` before its `offer.found`               | Buffered and applied when the offer arrives.                                                                 |
| `offer.found` with an id already seen                  | Updates that offer in place.                                                                                 |
| No `ranking.ready` yet                                 | Offers are sorted by `effective_total_sek` and marked provisional.                                            |
| `hunt.done` or `error`                                 | The client closes the stream, so `EventSource` does not auto-reconnect.                                       |
| `kind` / `layer`                                       | Known: `prompt_injection`, `redirect`, `exfiltration`, `checkout_attempt` / `egress_proxy`, `action_firewall`, `injection_guard`, `number_check`. Unknown values are shown humanized. |

**Resume and dedupe** ([src/api/events.ts](src/api/events.ts)):

- Every event should carry an `id:`.
- On its own reconnects (server closed the stream, network blip), the browser sends the `Last-Event-ID` **header**.
- If the stream is closed for good (non-200 response, wrong content type), the client reconnects with back-off (1 s → 15 s, 8 tries). It passes the id as a **`?last_event_id=` query parameter**, because `EventSource` cannot set headers. **The backend should accept both** and replay events after that id.
- Overlapping replays are fine: an event with the same id *and* the same payload is dropped.
- Please send a comment heartbeat (`: ping`) every ~15 s so proxies don't drop idle streams.

**Screenshots:** `url` / `screenshot_url` must be either a path or URL on the API origin (`/api/screenshots/abc.png` or `${VITE_API_BASE}/…`) or a `data:image/...` URL. Anything else is not loaded, and the tile says so.

---

## Security model (frontend)

Store content is hostile, and the frontend treats every backend string that way.

- **Text only.** No `dangerouslySetInnerHTML` anywhere. Product titles, agent logs and attack details render as text, so a title like `<img onerror=…>` shows literally.
- **Runtime validation.** Every SSE event and REST response goes through [src/api/sanitize.ts](src/api/sanitize.ts): shapes are checked, unknown types dropped, strings capped.
- **Markdown** ([src/components/SafeMarkdown.tsx](src/components/SafeMarkdown.tsx)): react-markdown without rehype-raw and with `skipHtml`, so raw HTML is dropped. Images are disallowed. Links are allowed only if absolute `http(s)`; they open in a new tab with `rel="noopener noreferrer"`. `javascript:`, `data:` and relative links become plain text.
- **Evidence modal.** Store URLs are plain text with a copy button, never clickable. The host is checked against the sandbox's allowlisted domain.
- **Screenshots** load only from the API origin or `data:image/*` ([src/lib/security.ts](src/lib/security.ts)). Every `<img>` uses `referrerPolicy="no-referrer"`, and the page sets `<meta name="referrer" content="no-referrer">`.
- **CSP.** The production build injects a strict policy ([vite.config.ts](vite.config.ts)): `script-src 'self'`, `style-src 'self'`, `img-src 'self' data: <api>`, `connect-src 'self' <api>`, `object-src 'none'`, `base-uri 'none'`, `frame-src 'none'`. Fonts are self-hosted (`@fontsource-variable`), so nothing loads from third parties.

---

## Accessibility and design

- **Keyboard:** fully keyboard navigable, with a skip link and visible focus rings (2 px, ink colour).
  - Mobile tabs use arrow keys and Home/End.
  - The evidence modal is a native `<dialog>`: focus is trapped, Escape closes it, and focus returns to the button that opened it.
  - The compare drawer moves focus to its heading, and Escape closes it.
- **Live regions:** `aria-live="polite"` on the grid summary, results summary, ranking text, re-verify result and attack log.
- **Not colour-only:** trust badges, statuses and promo states pair every colour with an icon and text.
- **Contrast:** WCAG AA. Muted text `#9097A6` is 6.2:1 on surfaces.
- **Motion:** subtle only (tile rise, screenshot crossfade, blocked flash). `prefers-reduced-motion` disables animations; blocked tiles keep a static red border and reason.
- **Responsive:** down to 375 px.
  - Tiles: 1 column on mobile, 2 on tablet, 5×2 on desktop (≥ 1280 px).
  - Security scoreboard: a sticky side panel at ≥ 1024 px, a tab below that.
- **Palette** (Tailwind v4 `@theme` in [src/index.css](src/index.css); the default palette is removed):
  - Background `#0B0C0F`, surface `#14161B`, border `#262A33`, text `#ECEAE4`, muted `#9097A6`.
  - Lime `#C6F432` for primary actions only.
  - Green `#5FD38D`, amber `#F2B84B` and red `#FF6B5E` only for trust and security. Operational errors are neutral.
- **Type:** Inter for UI and JetBrains Mono for logs and metadata. Prices use tabular figures and sv-SE formatting ("9 441 kr").

---

## Project structure

```
src/
  main.tsx, App.tsx, index.css, types.ts, vite-env.d.ts
  api/
    client.ts        typed fetch client; switches to the mock when VITE_USE_MOCK=true
    events.ts        EventSource with Last-Event-ID resume + dedupe by id
    sanitize.ts      runtime validation of all backend data
    mock.ts          scripted mock backend (both scenarios, pricing engine, compare)
    mockScreens.ts   generated SVG screenshots for the mock
  state/
    huntReducer.ts   every SSE event → state; UI actions; selectors
    HuntContext.tsx  provider: config, stream lifecycle, actions
  components/
    Header, HuntForm, PlanReview, SandboxGrid, StoreTile, Results, OfferCard,
    TrustBadge, PromoChip, EvidenceModal, CompareDrawer, SecurityScoreboard,
    MetricsBar, SafeMarkdown, ui (buttons, section header, spinner, error note)
  lib/
    format.ts        sv-SE currency, numbers, timers, relative time
    security.ts      screenshot / link URL allowlists
    membership.ts    membership matching
    labels.ts        attack kinds, defence layers, action log formatting
    env.ts, useNow.ts
```
