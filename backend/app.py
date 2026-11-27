"""BlackBear API: start hunts, approve plans, stream events (SSE), serve evidence + UI."""
import asyncio
import json
import re
from pathlib import Path

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import compare, config, contract, dealmath, dispatcher, engine, llm, stores

app = FastAPI(title="BlackBear", version="0.1")
ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
FRONTEND_DIST = ROOT / "frontend" / "dist"
MAX_ACTIVE = 2


class HuntIn(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    quantity: int = Field(default=1, ge=1, le=20)
    memberships: list[str] = []
    auto_approve: bool = True
    include_trap: bool = False
    simulate_compromise: bool | None = None  # default: on when the honeypot is selected (red-team replay)
    budget_sek: float | None = None
    store_ids: list[str] = []


@app.on_event("startup")
async def startup():
    await llm.load_pricing()
    await dispatcher.cleanup_orphans()


@app.get("/api/health")
async def health():
    return {"ok": True, "models": {"planner": config.PLANNER_MODEL, "scout": config.SCOUT_MODEL,
                                   "compare": config.COMPARE_MODEL, "safety": config.SAFETY_MODEL}}


@app.get("/api/stores")
async def list_stores():
    return {"stores": [{"id": k, "name": v["name"], "memberships": v["memberships"], "egress": v["allow"]}
                       for k, v in stores.STORES.items()], "memberships": stores.ALL_MEMBERSHIPS}


@app.post("/api/hunts")
async def create_hunt(body: HuntIn):
    active = [h for h in engine.HUNTS.values() if h.status not in ("done", "error")]
    if len(active) >= MAX_ACTIVE:
        raise HTTPException(429, "Too many hunts running, try again in a minute.")
    ms = contract.parse_memberships(body.memberships)
    sids = [s for s in body.store_ids if s in stores.STORES]
    trap = body.include_trap or "trapshop" in sids
    h = engine.Hunt(body.query.strip(), body.quantity, ms, body.auto_approve, trap)
    h.simulate_compromise = trap and (body.simulate_compromise if body.simulate_compromise is not None
                                      else "trapshop" in sids)
    h.store_ids = sids
    h.budget_sek = body.budget_sek if body.budget_sek and body.budget_sek > 0 else None
    engine.HUNTS[h.id] = h
    asyncio.create_task(h.run())
    return {"hunt_id": h.id, "id": h.id}


@app.post("/api/hunts/{hid}/approve")
async def approve(hid: str):
    h = engine.HUNTS.get(hid) or _404()
    h.approved.set()
    return Response(status_code=204)


@app.get("/api/hunts/{hid}")
async def get_hunt(hid: str):
    h = engine.HUNTS.get(hid) or _404()
    return {"id": h.id, "status": h.status, "plan": h.plan, "result": h.result, "metrics": h.metrics.snapshot(),
            "security": h.score.counts}


@app.get("/api/config")
async def app_config():
    return contract.app_config()


@app.get("/api/hunts/{hid}/events")
async def contract_events(hid: str, request: Request, last_event_id: str | None = None):
    """Contract SSE stream (frontend/README.md): ids, Last-Event-ID resume, ping every 15 s."""
    h = engine.HUNTS.get(hid) or _404()
    raw = request.headers.get("last-event-id") or last_event_id or "0"
    after = int(raw) if raw.isdigit() else 0
    q: asyncio.Queue = asyncio.Queue()

    def fmt(c):
        return f"id: {c['id']}\ndata: {json.dumps(c['data'], ensure_ascii=False)}\n\n"

    async def gen():
        h.csubs.add(q)
        try:
            sent = after
            for c in list(h.cevents):
                if c["id"] > sent:
                    sent = c["id"]
                    yield fmt(c)
            while True:
                try:
                    c = await asyncio.wait_for(q.get(), 15)
                    if c["id"] > sent:
                        sent = c["id"]
                        yield fmt(c)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            h.csubs.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _find_offer(offer_id):
    hid, _, sid = offer_id.partition("-")
    h = engine.HUNTS.get(hid)
    if not h:
        _404()
    d = next((x for x in h.deals if x["store"] == sid), None)
    if not d:
        _404()
    return h, d


@app.post("/api/offers/{offer_id}/reverify")
async def reverify_offer(offer_id: str):
    h, d = _find_offer(offer_id)
    before = d["unit_price"]
    try:
        d = await asyncio.wait_for(h.reverify_offer(d["store"]), config.SANDBOX_TIMEOUT_S + 60)
    except KeyError:
        raise HTTPException(409, "This offer has no product page to re-verify.")
    rv = d.get("reverify") or {}
    ev = rv.get("evidence") or {}
    return {"offer_id": offer_id, "same_price": rv.get("status") == "same",
            "price_sek": rv.get("unit_price") if rv.get("unit_price") is not None else before,
            "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "screenshot_url": contract.shot_url(h.id, ev.get("cart") or ev.get("product"))}


class CompareIn(BaseModel):
    offer_a: str
    offer_b: str


@app.post("/api/compare")
async def compare_offers(body: CompareIn):
    ha, a = _find_offer(body.offer_a)
    _, b = _find_offer(body.offer_b)
    a, b = dict(a), dict(b)
    pair = dealmath.rank([a, b])
    best = pair[0]
    winner = (body.offer_a if best is a else body.offer_b) if best.get("rank") else ""

    def kr(x):
        return "–" if x is None else f"{x:g} kr"

    rows = [("Store", a["store_name"], b["store_name"]),
            ("Unit price", kr(a["unit_price"]), kr(b["unit_price"])),
            ("Quantity", str(a["quantity"]), str(b["quantity"])),
            ("Promo applied for you", a.get("applied_promo") or "–", b.get("applied_promo") or "–"),
            ("Member-only price", kr(a.get("member_items_total")), kr(b.get("member_items_total"))),
            ("Shipping", kr(a.get("shipping")) if a.get("shipping") is not None else "not shown",
             kr(b.get("shipping")) if b.get("shipping") is not None else "not shown"),
            ("Cart total read", kr(a.get("cart_total")), kr(b.get("cart_total"))),
            ("Total incl. shipping",
             kr(a["your_total"]) if a.get("shipping") is not None else "unknown",
             kr(b["your_total"]) if b.get("shipping") is not None else "unknown"),
            ("Trust", contract.TRUST[a["audit"]["label"]], contract.TRUST[b["audit"]["label"]])]
    exp = await compare.explain(pair, ha.plan, ha.metrics)
    return {"winner_id": winner, "explanation_md": exp["explanation"],
            "breakdown": [{"label": l, "a": x, "b": y} for l, x, y in rows]}


@app.get("/api/hunts/{hid}/raw-events")
async def events(hid: str, since: int = 0):
    h = engine.HUNTS.get(hid) or _404()
    q: asyncio.Queue = asyncio.Queue()

    async def gen():
        for ev in h.events[since:]:
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        h.subscribers.add(q)
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), 15)
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            h.subscribers.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/hunts/{hid}/evidence/{name}")
async def evidence(hid: str, name: str):
    if not re.fullmatch(r"[a-z0-9]{10}", hid) or not re.fullmatch(r"[\w.-]+\.jpg", name):
        _404()
    p = config.DATA_DIR / "hunts" / hid / name
    if not p.exists():
        _404()
    return FileResponse(p, media_type="image/jpeg")


def _404():
    raise HTTPException(404, "not found")


app.mount("/trap", StaticFiles(directory=WEB / "trap", html=True), name="trap")
app.mount("/lite", StaticFiles(directory=WEB, html=True), name="lite")
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
