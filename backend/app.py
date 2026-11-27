"""BlackBear API: start hunts, approve plans, stream events (SSE), serve evidence + UI."""
import asyncio
import json
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, dispatcher, engine, llm, stores

app = FastAPI(title="BlackBear", version="0.1")
WEB = Path(__file__).resolve().parent.parent / "web"
MAX_ACTIVE = 2


class HuntIn(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    quantity: int = Field(default=1, ge=1, le=20)
    memberships: list[str] = []
    auto_approve: bool = True
    include_trap: bool = False
    simulate_compromise: bool = False


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
    ms = [m for m in body.memberships if m in stores.ALL_MEMBERSHIPS]
    h = engine.Hunt(body.query.strip(), body.quantity, ms, body.auto_approve, body.include_trap)
    h.simulate_compromise = body.include_trap and body.simulate_compromise
    engine.HUNTS[h.id] = h
    asyncio.create_task(h.run())
    return {"id": h.id}


@app.post("/api/hunts/{hid}/approve")
async def approve(hid: str):
    h = engine.HUNTS.get(hid) or _404()
    h.approved.set()
    return {"ok": True}


@app.get("/api/hunts/{hid}")
async def get_hunt(hid: str):
    h = engine.HUNTS.get(hid) or _404()
    return {"id": h.id, "status": h.status, "plan": h.plan, "result": h.result, "metrics": h.metrics.snapshot(),
            "security": h.score.counts}


@app.get("/api/hunts/{hid}/events")
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


app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
