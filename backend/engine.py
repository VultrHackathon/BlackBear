"""BlackBear engine: runs steps 1-10 for one hunt and streams events."""
import asyncio
import json
import time
import traceback
import uuid

from . import compare, config, dealmath, dispatcher, guard, llm, planner, scout


class Hunt:
    def __init__(self, query, quantity, memberships, auto_approve=True, include_trap=False):
        self.include_trap = include_trap
        self.simulate_compromise = False
        self.id = uuid.uuid4().hex[:10]
        self.query, self.quantity, self.memberships = query, int(quantity), list(memberships)
        self.auto_approve = auto_approve
        self.dir = config.DATA_DIR / "hunts" / self.id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.events = []
        self.subscribers = set()
        self.metrics = llm.Metrics()
        self.score = guard.Scoreboard(self.emit)
        self.approved = asyncio.Event()
        self.plan = None
        self.status = "created"
        self.started = time.time()
        self.result = None

    async def emit(self, kind, data):
        ev = {"seq": len(self.events), "t": round(time.time() - self.started, 2), "kind": kind, "data": data}
        self.events.append(ev)
        for q in list(self.subscribers):
            q.put_nowait(ev)
        if kind in ("step", "security", "deal", "result", "plan"):
            await self._metrics()

    async def _metrics(self):
        ev = {"seq": len(self.events), "t": round(time.time() - self.started, 2), "kind": "metrics",
              "data": {**self.metrics.snapshot(), "elapsed_s": round(time.time() - self.started, 1),
                       "security": self.score.counts}}
        self.events.append(ev)
        for q in list(self.subscribers):
            q.put_nowait(ev)

    async def run(self):
        try:
            self.status = "planning"
            await self.emit("status", {"status": "planning", "message": "Planner agent is building the plan"})
            # 2. Planner
            self.plan = await planner.make_plan(self.query, self.quantity, self.memberships, self.metrics)
            if self.include_trap:
                planner.add_demo_store(self.plan)
                self.plan["simulate_compromise"] = self.simulate_compromise
            await self.emit("plan", self.plan)
            if self.auto_approve:
                self.approved.set()
            else:
                self.status = "awaiting_approval"
                await self.emit("status", {"status": "awaiting_approval", "message": "Approve the plan to start"})
            await asyncio.wait_for(self.approved.wait(), 600)
            await self.emit("status", {"status": "hunting", "message": "Plan approved, dispatching sandboxes"})
            self.status = "hunting"

            # 3+4+5. Dispatcher -> scouts in parallel sandboxes, guarded every step
            results = await asyncio.gather(*[self._scout(s, "hunt") for s in self.plan["stores"]])

            # 6+7. Deal math + discount auditor (code)
            deals = []
            for r in results:
                d = dealmath.compute_deal(r, self.quantity, self.memberships)
                if d:
                    deals.append(d)
                    await self.emit("deal", d)
            deals = dealmath.rank(deals)

            # 9. Re-verify top 3 in brand-new sandboxes
            top = [d for d in deals if d.get("rank") and d.get("product_url")][:3]
            if top:
                await self.emit("status", {"status": "reverifying", "message": f"Re-verifying top {len(top)} in new sandboxes"})
                store_by_id = {s["id"]: s for s in self.plan["stores"]}
                rv = await asyncio.gather(*[self._scout(store_by_id[d["store"]], "verify", d["product_url"]) for d in top])
                for d, r in zip(top, rv):
                    d["reverify"] = self._reverify(d, r)
                    await self.emit("reverify", {"store": d["store"], **d["reverify"]})
                deals = dealmath.rank(deals)

            # 8. Compare agent explains code-computed numbers (number-checked)
            exp = await compare.explain(deals, self.plan, self.metrics)
            for rj in exp["rejected"]:
                await self.score.record("explanation_rejected", "compare",
                                        f"numbers not computed by code: {rj.get('bad_numbers')}", "medium")

            # 10. Results
            self.result = {"deals": deals, "explanation": exp, "plan": self.plan}
            (self.dir / "result.json").write_text(json.dumps(self.result, ensure_ascii=False, indent=1))
            self.status = "done"
            await self.emit("result", self.result)
            await self.emit("status", {"status": "done", "message": "Hunt finished"})
        except Exception as e:
            self.status = "error"
            await self.emit("status", {"status": "error", "message": f"{type(e).__name__}: {e}",
                                       "trace": traceback.format_exc()[-1500:]})

    async def _scout(self, store, mode, start_url=None):
        sid = store["id"]
        sb = dispatcher.Sandbox(sid, self.score.proxy_event)
        try:
            await self.emit("sandbox", {"store": sid, "mode": mode, "state": "starting", "sandbox": sb.id,
                                        "limits": {"memory": config.SANDBOX_MEMORY, "cpus": config.SANDBOX_CPUS,
                                                   "timeout_s": config.SANDBOX_TIMEOUT_S, "runtime": config.SANDBOX_RUNTIME,
                                                   "egress": store["allow"]}})
            await sb.start()
            self.score.counts["sandboxes_created"] += 1
            await self.emit("sandbox", {"store": sid, "mode": mode, "state": "running", "sandbox": sb.id})
            sc = scout.Scout(sb, store, self.plan, self.emit, self.score, self.metrics, self.dir, mode, start_url)
            try:
                res = await asyncio.wait_for(sc.run(), config.SANDBOX_TIMEOUT_S)
            except asyncio.TimeoutError:
                res = sc.result("timeout", f"hard time limit {config.SANDBOX_TIMEOUT_S}s reached")
                await self.score.record("timeout_enforced", sid, res["reason"], "medium")
        except Exception as e:
            res = {"store": sid, "store_name": store["name"], "status": "error", "reason": f"{type(e).__name__}: {e}"[:300],
                   "offer": None, "cart": None, "evidence": {}, "mode": mode}
        finally:
            await sb.destroy()
            self.score.counts["sandboxes_destroyed"] += 1
            await self.emit("sandbox", {"store": sid, "mode": mode, "state": "destroyed", "sandbox": sb.id})
        await self.emit("scout_result", res)
        return res

    def _reverify(self, deal, r):
        if not r.get("offer"):
            return {"status": "failed", "detail": r.get("reason") or r.get("status")}
        d2 = dealmath.compute_deal({**r, "store_name": deal["store_name"]}, self.quantity, self.memberships)
        if not d2:
            return {"status": "failed", "detail": "no price on re-check"}
        same_unit = abs((d2["unit_price"] or 0) - (deal["unit_price"] or 0)) <= 0.01
        # compare carts only when both held the same quantity; otherwise the audit already
        # checked each cart against the price for its own quantity
        same_cart = (d2.get("cart_total") is None or deal.get("cart_total") is None
                     or d2.get("cart_quantity") != deal.get("cart_quantity")
                     or abs(d2["cart_total"] - deal["cart_total"]) <= 0.5)
        if d2["audit"]["label"] == "mismatch":
            same_cart = False
        if same_unit and same_cart:
            return {"status": "same", "unit_price": d2["unit_price"], "cart_total": d2.get("cart_total"),
                    "evidence": r.get("evidence")}
        if not same_unit:
            deal["audit"]["findings"].append(
                f"Price changed on re-check: {deal['unit_price']:g} kr -> {d2['unit_price']:g} kr.")
        else:
            deal["audit"]["findings"].append(
                f"Cart total changed on re-check: {deal['cart_total']:g} kr -> {d2['cart_total']:g} kr.")
        if deal["audit"]["label"] == "verified":
            deal["audit"]["label"] = "questionable"
        return {"status": "changed", "unit_price": d2["unit_price"], "cart_total": d2.get("cart_total"),
                "evidence": r.get("evidence")}


HUNTS: dict[str, Hunt] = {}
