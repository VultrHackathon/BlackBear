# blackbear frontend

**Proof, not promises.** blackbear finds the best Black Friday deal for a product across about ten Swedish web stores. A planner agent makes a plan. Then ten browser agents run in parallel, each locked in its own Vultr sandbox that can only reach its own store. Every price comes with a screenshot. Code computes the real price (shipping, multi-buy, codes, member prices), and an auditor labels each offer Real, Questionable or Fake. A red team attacks our own honeypot shop, and a scoreboard shows the layer that stopped each attack.

Built for the Vultr Agent Runtime Hackathon, Stockholm, Black Friday 2026. This is the `frontend/` part of the BlackBear repo; the backend lives in `../backend/` and must implement the [API contract](#api-contract) below.

React 18 · TypeScript · Vite 8 · Tailwind CSS v4 · lucide-react · react-markdown. State is `useReducer` + context; there is no other UI or state library.

> **Branch `prototype/ecommerce1`:** a chat-first storefront. You tell the agent what you want, watch the live sandboxes, then pick from a product shelf. The agent asks only questions the data makes worth asking. The hunt form, plan review, results list, security scoreboard, metrics bar and compare drawer are not used here; they remain on `main`.

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

1. Type "65-inch OLED TV" in the chat. The agent asks how many; answer 1. It shows the 10 stores it will check; click **Start hunting**.
2. Watch the live sandboxes. Click any monitor for a larger view with its full action log. The **SuperDeals** honeypot flashes red twice, and the chat reports both attacks and the layer that stopped them.
3. When the hunt is done, the stage folds and the products move up. NetOnNet is the best deal at 14 240 kr. Power's "−42%" sticker is struck through: the auditor judged it **Fake**.
4. The agent asks about delivery, because without it CDON is cheapest (13 790 kr). Pick **Product price only** and the shelf re-sorts.
5. Open any product. The page address is plain text with a copy button, never a link. **Check the price again** re-verifies it in a fresh sandbox.
6. In the same chat, type "Saffran 0,5 g" and answer 2. The agent asks whether you have Stammis, because Apotek Hjärtat's member price (49 kr) beats the best deal. Answer **Yes, search again**: Hjärtat now wins at 49 kr.

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
  - The product view and the sandbox view share one native `<dialog>` shell ([src/components/Modal.tsx](src/components/Modal.tsx)): focus is trapped, Escape closes it, and focus returns to the button or tile that opened it.
  - Each sandbox tile is one button. In the sandbox view, Previous / Next or the arrow keys switch sandbox.
  - The agent's questions are buttons in the conversation. On small screens, when the chat has scrolled away, a floating button brings you back to the open question.
- **Live regions:** the conversation is a `role="log"`; the sandbox progress, product count, re-verify result and the sandbox view's status line are `aria-live="polite"`.
- **Not colour-only:** trust badges, statuses and promo states pair every colour with an icon and text.
- **Contrast:** WCAG AA. Muted text is `#63625E` on the light page and `#9097A6` on the dark stage.
- **Motion:** tile rise, screenshot crossfade, blocked flash, and three effects that run only while a sandbox is working: a light travelling round the screen bezel, a beam sweeping the screen while extracting, and corner brackets while verifying. They animate transform and opacity only, and a finished sandbox is completely still. `prefers-reduced-motion` removes them; the status word and icon always carry the meaning, and blocked tiles keep a static red border and reason.
- **Responsive:** down to 375 px.
  - Below 1024 px everything stacks: chat, then sandboxes, then products. From 1024 px the chat is a sticky panel on the left.
  - Sandbox tiles fill the row at 11 rem or wider; product cards at 14 rem or wider.
- **Palette** (Tailwind v4 `@theme` in [src/index.css](src/index.css); the default palette is removed):
  - Light page: canvas `#F4F3EF`, cards `#FFFFFF`, text `#141414`, muted `#63625E`.
  - Yellow `#FFC21A` for primary actions and the discount stickers.
  - Green, amber and red only for trust and security. Operational errors are neutral.
  - The sandbox stage, the sandbox view and every screenshot frame use the dark palette: `.theme-dark` swaps the colour and shadow variables for its subtree.
- **Store marks** ([src/lib/brands.ts](src/lib/brands.ts)) are each store's initials on its brand colour, not its logo.
- **Depth:** one light source, straight above, defined as shadow tokens in `@theme`. Raised things (buttons, cards, sandbox monitors) have a highlight on the top edge and a shadow underneath; recessed things (inputs, screens, readouts) have an inner shadow. A pressed button moves down 1 px and its shadow turns inward.
- **Components:** `Button`, `Pill`, `Led`, `Switch`, `ToggleChip` and the input style live in [src/components/ui.tsx](src/components/ui.tsx). Size and colour come from props, not from extra utility classes: two classes that set the same property do not reliably override each other.
- **Sandbox monitors** show only what the event stream reports: status, screenshot, actions, timer and the allowed domain. One mark in the activity strip is one agent action (the last 20 are kept), red when it was blocked.
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
    Chat (conversation + the agent's questions), SandboxStage, StoreTile, Monitor,
    SandboxFocus, ProductShelf, EvidenceModal (product view), ProofScreen, Modal,
    SiteChrome (header, footer with store marks), HeroArt, StoreMark, BrandMark,
    PromoChip, SafeMarkdown, trust, ui (button, pill, status light, switch, chip, input style)
  lib/
    format.ts        sv-SE currency, numbers, timers, relative time
    security.ts      screenshot / link URL allowlists
    membership.ts    membership matching
    labels.ts        attack kinds, defence layers, action log formatting
    deals.ts         delivery and membership arithmetic behind the agent's questions
    brands.ts        store brand colours and initials
    env.ts, useNow.ts
```
