"""CLI hunt: python -m tests.run_hunt "<query>" <qty> [store,store] [membership,...]"""
import asyncio, json, sys
from backend import engine, llm, planner

async def main():
    query, qty = sys.argv[1], int(sys.argv[2])
    only = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else None
    ms = sys.argv[4].split(",") if len(sys.argv) > 4 else []
    if only:
        orig = planner.validate
        def v(*a, **k):
            p = orig(*a, **k); p["stores"] = [s for s in p["stores"] if s["id"] in only] or p["stores"]; return p
        planner.validate = v
    await llm.load_pricing()
    h = engine.Hunt(query, qty, ms)
    q = asyncio.Queue(); h.subscribers.add(q)
    task = asyncio.create_task(h.run())
    while True:
        ev = await q.get(); k, d = ev["kind"], ev["data"]
        if k == "metrics": continue
        if k == "step":
            a = d["action"]; print(f"[{ev['t']:6.1f}] {d['mode']}:{d['store']} #{d['step']} {a.get('action')} {a.get('i','')} {str(a.get('text') or a.get('url') or '')[:50]} | {str(a.get('thought',''))[:90]}" + ("" if d["allowed"] else f"  BLOCKED: {d['blocked_reason']}"))
        elif k == "security": print(f"[{ev['t']:6.1f}] SEC {d['event']['kind']} {d['event']['store']}: {d['event']['detail'][:120]}")
        elif k in ("plan", "deal", "scout_result", "reverify", "offer_seen"): print(f"[{ev['t']:6.1f}] {k.upper()}", json.dumps(d, ensure_ascii=False)[:700])
        elif k == "result": print("EXPLANATION:", json.dumps(d["explanation"], ensure_ascii=False)[:900])
        elif k == "status":
            print(f"[{ev['t']:6.1f}] STATUS {d}")
            if d["status"] in ("done", "error"): break
    await task
    print("METRICS", json.dumps(h.metrics.snapshot()), "\nSECURITY", h.score.counts, "\nDIR", h.dir)

asyncio.run(main())
