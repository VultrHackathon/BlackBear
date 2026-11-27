"""BlackBear engine: runs steps 1-10 for one hunt and streams events."""
import asyncio
import json
import time
import traceback
import uuid

from . import compare, config, contract, dealmath, dispatcher, guard, llm, matcher, planner, scout


APPROVAL_TIMEOUT_S = 60  # unanswered approvals are denied
MAX_ACTIVE_HUNTS = 2     # hunts running sandboxes at the same time; the rest wait in line
_slots: asyncio.Semaphore | None = None
_waiting = 0


def slots() -> asyncio.Semaphore:
    global _slots
    if _slots is None:
        _slots = asyncio.Semaphore(MAX_ACTIVE_HUNTS)
    return _slots


class Hunt:
    def __init__(self, query, quantity, memberships, auto_approve=True, include_trap=False):
        self.include_trap = include_trap
        self.simulate_compromise = False
        self.store_ids: list[str] = []
        self.budget_sek = None
        self.deals: list = []
        self.cevents: list = []      # contract events (frontend API)
        self.csubs: set = set()
        self._sb_open: dict = {}
        self.approvals: dict = {}
        self._sb_done = 0.0
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

    def sandbox_seconds(self):
        now = time.time()
        return self._sb_done + sum(now - t for t in self._sb_open.values())

    def _push(self, kind, data):
        ev = {"seq": len(self.events), "t": round(time.time() - self.started, 2), "kind": kind, "data": data}
        self.events.append(ev)
        for q in list(self.subscribers):
            q.put_nowait(ev)
        try:
            for c in contract.translate(self, ev):
                c = {"id": len(self.cevents) + 1, "data": c}
                self.cevents.append(c)
                for q in list(self.csubs):
                    q.put_nowait(c)
        except Exception as e:  # the adapter must never break a hunt
            print("contract translate error", kind, e, flush=True)

    async def emit(self, kind, data):
        self._push(kind, data)
        if kind in ("step", "security", "deal", "result", "plan"):
            await self._metrics()

    async def _metrics(self):
        self._push("metrics", {**self.metrics.snapshot(), "elapsed_s": round(time.time() - self.started, 1),
                               "security": self.score.counts})

    async def run(self):
        try:
            self.status = "planning"
            await self.emit("status", {"status": "planning", "message": "Planner agent is building the plan"})
            # 2. Planner
            self.plan = await planner.make_plan(self.query, self.quantity, self.memberships, self.metrics)
            if self.store_ids:
                planner.restrict_stores(self.plan, self.store_ids)
            if self.include_trap or "trapshop" in self.store_ids:
                planner.add_demo_store(self.plan)
                self.plan["simulate_compromise"] = self.simulate_compromise
            self.plan["budget_sek"] = self.budget_sek
            await self.emit("plan", self.plan)
            if self.auto_approve:
                self.approved.set()
            else:
                self.status = "awaiting_approval"
                await self.emit("status", {"status": "awaiting_approval", "message": "Approve the plan to start"})
            await asyncio.wait_for(self.approved.wait(), 600)
            # Only hunts that run sandboxes take a slot; plans waiting for approval never do.
            global _waiting
            if slots().locked():
                self.status = "queued"
                await self.emit("status", {"status": "queued", "message":
                                           f"All sandbox slots are busy; waiting for a free slot ({_waiting + 1} in line)"})
            _waiting += 1
            try:
                await slots().acquire()
            finally:
                _waiting -= 1
            try:
                await self._hunt()
            finally:
                slots().release()
        except Exception as e:
            self.status = "error"
            await self.emit("status", {"status": "error", "message": f"{type(e).__name__}: {e}",
                                       "trace": traceback.format_exc()[-1500:]})

    async def _hunt(self):
        """Steps 3-10, holding a sandbox slot."""
        try:
            await self.emit("status", {"status": "hunting", "message": "Plan approved, dispatching sandboxes"})
            self.status = "hunting"

            # 3+4+5. Dispatcher -> scouts in parallel sandboxes, guarded every step
            results = await asyncio.gather(*[self._scout(s, "hunt") for s in self.plan["stores"]])

            # 6+7. Deal math + discount auditor (code)
            deals = []
            for r in results:
                d = dealmath.compute_deal(r, self.quantity, self.memberships)
                if d:
                    if self.budget_sek and d["your_total"] > self.budget_sek:
                        d["audit"]["findings"].append(f"Over your budget of {self.budget_sek:g} kr.")
                    deals.append(d)
                    self.deals = deals
                    await self.emit("deal", d)
            deals = await matcher.classify(self.plan, deals, self.metrics)
            deals = dealmath.rank(deals)
            self.deals = deals

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
            exp = await compare.explain(deals, self.plan, self.metrics, scout_results=results)
            for rj in exp["rejected"]:
                await self.score.record("explanation_rejected", "compare",
                                        f"numbers not computed by code: {rj.get('bad_numbers')}", "medium")

            # 10. Results
            self.result = {"deals": deals, "explanation": exp, "plan": self.plan}
            (self.dir / "result.json").write_text(json.dumps(self.result, ensure_ascii=False, indent=1))
            self.status = "done"
            await self.emit("result", self.result)
            await self.emit("status", {"status": "done", "message": "Hunt finished"})
        finally:
            pass

    async def _scout(self, store, mode, start_url=None, honest=False):
        sid = store["id"]
        sb = dispatcher.Sandbox(sid, self.score.proxy_event)
        try:
            await self.emit("sandbox", {"store": sid, "mode": mode, "state": "starting", "sandbox": sb.id,
                                        "limits": {"memory": config.SANDBOX_MEMORY, "cpus": config.SANDBOX_CPUS,
                                                   "timeout_s": config.SANDBOX_TIMEOUT_S, "runtime": config.SANDBOX_RUNTIME,
                                                   "egress": store["allow"]}})
            try:
                await sb.start()
            except Exception as e:  # one visible retry with a brand-new sandbox
                await self.emit("step", {"store": sid, "mode": mode, "step": 0, "allowed": True,
                                         "action": {"action": "retry",
                                                    "thought": f"sandbox failed to start ({str(e)[:80]}); "
                                                               "starting a fresh one"}})
                await sb.destroy()
                sb = dispatcher.Sandbox(sid, self.score.proxy_event)
                await sb.start()
            self._sb_open[sb.id] = time.time()
            self.score.counts["sandboxes_created"] += 1
            await self.emit("sandbox", {"store": sid, "mode": mode, "state": "running", "sandbox": sb.id})
            sc = scout.Scout(sb, store, self.plan, self.emit, self.score, self.metrics, self.dir, mode, start_url,
                             approver=self.request_approval, honest=honest)
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
            await self.score.summarize_third_party(sid)
            if sb.id in self._sb_open:
                self._sb_done += time.time() - self._sb_open.pop(sb.id)
            self.score.counts["sandboxes_destroyed"] += 1
            await self.emit("sandbox", {"store": sid, "mode": mode, "state": "destroyed", "sandbox": sb.id})
        await self.emit("scout_result", res)
        if res.get("status") == "compromised_demo" and not honest:
            # The red-team replay is contained; now shop the demo store honestly in a fresh
            # sandbox, so its hidden cart fee shows up as a real "Fake" verdict.
            return await self._scout(store, mode, start_url, honest=True)
        return res

    async def request_approval(self, store_id, step, action, reason, screenshot):
        """Approve-before-submit gate: pause this scout until a human decides (fail-safe: deny on timeout)."""
        aid = f"{self.id}-a{len(self.approvals) + 1}"
        gate = {"event": asyncio.Event(), "approved": None, "store": store_id}
        self.approvals[aid] = gate
        self.score.counts["approvals_requested"] += 1
        await self.emit("approval", {"id": aid, "state": "required", "store": store_id, "step": step,
                                     "action": {k: v for k, v in action.items()}, "reason": reason,
                                     "screenshot": screenshot, "timeout_s": APPROVAL_TIMEOUT_S})
        try:
            await asyncio.wait_for(gate["event"].wait(), APPROVAL_TIMEOUT_S)
            by = "you"
        except asyncio.TimeoutError:
            gate["approved"], by = False, "timeout"
        approved = bool(gate["approved"])
        if not approved:
            self.score.counts["approvals_denied"] += 1
        await self.emit("approval", {"id": aid, "state": "approved" if approved else "denied", "store": store_id,
                                     "by": by})
        await self.score.record("approval_gate", store_id,
                                f"{'approved' if approved else 'denied'} by {by}: {reason}",
                                "medium" if approved else "high")
        return approved

    def resolve_approval(self, aid, approve):
        gate = self.approvals.get(aid)
        if not gate:
            raise KeyError(aid)
        if gate["event"].is_set() or gate["approved"] is not None:
            return False
        gate["approved"] = bool(approve)
        gate["event"].set()
        return True

    async def reverify_offer(self, store_id):
        """On-demand re-verify of one offer in a brand-new sandbox (POST /api/offers/{id}/reverify)."""
        deal = next((d for d in self.deals if d["store"] == store_id), None)
        if not deal or not deal.get("product_url"):
            raise KeyError(store_id)
        store = next(s for s in self.plan["stores"] if s["id"] == store_id)
        r = await self._scout(store, "verify", deal["product_url"])
        deal["reverify"] = self._reverify(deal, r)
        await self.emit("reverify", {"store": store_id, **deal["reverify"]})
        return deal

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
        first_ok = any(f.startswith(("Guest cart total", "Cart applied")) for f in deal["audit"]["findings"])
        second_ok = any(f.startswith(("Guest cart total", "Cart applied")) for f in d2["audit"]["findings"])
        if same_unit and second_ok and not first_ok:
            # the first cart read did not add up, the fresh sandbox's read does: trust the consistent one
            old = deal.get("cart_total")
            deal["audit"] = d2["audit"]
            deal["audit"]["findings"].append(
                f"First cart read ({old:g} kr) did not add up; a fresh sandbox read {d2['cart_total']:g} kr, which matches."
                if old is not None else "Cart verified in a fresh sandbox.")
            deal["cart_total"], deal["cart_quantity"] = d2.get("cart_total"), d2.get("cart_quantity")
            deal["evidence"] = {**deal.get("evidence", {}), "cart": (r.get("evidence") or {}).get("cart")}
            return {"status": "same", "unit_price": d2["unit_price"], "cart_total": d2.get("cart_total"),
                    "evidence": r.get("evidence"), "note": "replaced an inconsistent first cart read"}
        if same_unit and same_cart:
            return {"status": "same", "unit_price": d2["unit_price"], "cart_total": d2.get("cart_total"),
                    "evidence": r.get("evidence")}
        if not same_unit:
            deal["audit"]["findings"].append(
                f"Price changed on re-check: {deal['unit_price']:g} kr -> {d2['unit_price']:g} kr.")
        else:
            def kr(x):
                return "not read" if x is None else f"{x:g} kr"
            deal["audit"]["findings"].append(
                f"Cart total changed on re-check: {kr(deal.get('cart_total'))} -> {kr(d2.get('cart_total'))}.")
        if deal["audit"]["label"] == "verified":
            deal["audit"]["label"] = "questionable"
        return {"status": "changed", "unit_price": d2["unit_price"], "cart_total": d2.get("cart_total"),
                "evidence": r.get("evidence")}


HUNTS: dict[str, Hunt] = {}
