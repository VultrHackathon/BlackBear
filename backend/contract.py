"""Adapter: engine events -> the frontend's API contract (frontend/README.md#api-contract).

The engine keeps its own internal event log; every internal event is translated
here into zero or more contract events with their own increasing ids.
"""
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

from . import config, stores

TRUST = {"verified": "real", "questionable": "questionable", "mismatch": "fake", "unverified": "unknown"}
ACTION = {"click": "click", "type": "type", "scroll": "scroll", "goto": "goto", "back": "goto", "wait": "retry",
          "retry": "retry", "extract": "extract", "done": "add_to_cart", "fail": "extract"}


def membership_labels():
    out = []
    for sid, st in stores.STORES.items():
        if sid in stores.DEMO_STORES:
            continue
        for m in st["memberships"]:
            out.append(f"{m} ({st['name']})")
    return out


def parse_memberships(items):
    """'Stammis (Apotek Hjärtat)' -> 'Stammis' (the parenthesised store name is ignored)."""
    out = []
    for m in items or []:
        base = re.sub(r"\s*\(.*\)\s*$", "", str(m)).strip()
        if base in stores.ALL_MEMBERSHIPS and base not in out:
            out.append(base)
    return out


def app_config():
    return {
        "model": f"{config.PLANNER_MODEL} (planner/compare) · {config.SCOUT_MODEL} (scouts) on Vultr Serverless Inference",
        "runtime": f"Chromium in gVisor ({config.SANDBOX_RUNTIME}) on a separate Vultr VM, egress via allowlist proxy",
        "stores": [{"id": sid, "name": st["name"], "domain": urlsplit(st["home"]).hostname,
                    **({"honeypot": True} if sid in stores.DEMO_STORES else {})}
                   for sid, st in stores.STORES.items()],
        "memberships": membership_labels(),
    }


def shot_url(hunt_id, name):
    return f"/api/hunts/{hunt_id}/evidence/{name}" if name else ""


def offer_id(hunt_id, store_id):
    return f"{hunt_id}-{store_id}"


def promo_out(rule, cart_applied):
    t = rule.get("type")
    p = {"text": rule.get("text") or "", "requires_membership": rule.get("membership"),
         "applied_in_cart": cart_applied}
    if t == "multibuy":
        p.update(type="multibuy", buy=rule.get("n"), bundle_price_sek=rule.get("price"))
    elif t == "x_for_y":
        p.update(type="multibuy", buy=rule.get("x"), pay_for=rule.get("y"))
    elif t == "percent":
        p.update(type="percent_off", percent=rule.get("pct"))
    elif t == "fixed":
        p.update(type="member_price" if rule.get("membership") else "amount_off", bundle_price_sek=rule.get("price"))
    else:
        p.update(type="amount_off")
    return p


def offer_out(hunt_id, d):
    ev = d.get("evidence") or {}
    rv = (d.get("reverify") or {}).get("evidence") or {}
    shot = ev.get("cart") or ev.get("product") or rv.get("cart") or rv.get("product")
    applied = d.get("cart_promo_applied")
    return {
        "id": offer_id(hunt_id, d["store"]), "store_id": d["store"],
        "title": d.get("product_name") or "", "url": d.get("product_url") or "",
        "price_sek": d["unit_price"], "previous_price_sek": d.get("was_price"),
        "lowest_30d_price_sek": d.get("lowest_30d_price"),
        "shipping_sek": d.get("shipping"), "in_stock": d.get("in_stock") is not False,
        "promos": [promo_out(r, applied) for r in d.get("rules", [])],
        "quantity": d["quantity"], "effective_total_sek": d["your_total"],
        "effective_unit_sek": d["your_unit_price"], "screenshot_url": shot_url(hunt_id, shot),
        "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "trust": trust_out(d),
        **({"unranked_reason": d["unranked_reason"]} if d.get("unranked_reason") else {}),
    }


def trust_out(d):
    reasons = list(d["audit"]["findings"])
    if d.get("shipping") is None:
        reasons.append("Shipping cost was not shown, so it is not included.")
    rv = d.get("reverify")
    if rv and rv.get("status") == "same":
        reasons.append("Re-verified in a fresh sandbox: same price.")
    return {"label": TRUST.get(d["audit"]["label"], "unknown"), "reasons": reasons}


def security_out(ev):
    kind, detail, store = ev["kind"], ev["detail"], ev["store"]
    if kind == "egress_blocked":
        # Only real exfiltration / metadata / private-network attempts are attacks; ordinary
        # third-party requests (trackers, chat widgets, CDNs) are reported as such.
        sev = ev.get("severity")
        k = "exfiltration" if (sev == "high" or "exfil" in detail) else "third_party_request"
        return {"store_id": store, "kind": k, "layer": "egress_proxy", "detail": detail, "blocked": True}
    if kind == "action_blocked":
        k = "checkout_attempt" if re.search(r"checkout|payment|login|account|card|personal", detail) else "redirect"
        return {"store_id": store, "kind": k, "layer": "action_firewall", "detail": detail, "blocked": True}
    if kind == "injection_detected":
        return {"store_id": store, "kind": "prompt_injection", "layer": "injection_guard", "detail": detail,
                "blocked": True}
    if kind == "explanation_rejected":
        return {"store_id": store, "kind": "unverified_number", "layer": "number_check", "detail": detail,
                "blocked": True}
    if kind == "approval_gate":
        denied = detail.startswith("denied")
        return {"store_id": store, "kind": "checkout_attempt", "layer": "approval_gate", "detail": detail,
                "blocked": denied}
    if kind == "timeout_enforced":
        return {"store_id": store, "kind": "time_limit", "layer": "resource_limit", "detail": detail, "blocked": True}
    return {"store_id": store, "kind": kind, "layer": "guard", "detail": detail, "blocked": False}


def translate(hunt, ev):
    """Internal event -> list of contract events (dicts with 'type')."""
    k, d = ev["kind"], ev["data"]
    out = []
    if k == "status":
        s = d.get("status")
        if s == "planning":
            out.append({"type": "hunt.started", "hunt_id": hunt.id, "query": hunt.query})
        elif s == "done":
            out.append({"type": "hunt.done", "elapsed_s": round(ev["t"], 1)})
        elif s == "error":
            out.append({"type": "error", "message": d.get("message", "error")[:300]})
    elif k == "plan":
        out.append({"type": "plan.ready", "plan": {
            "criteria": d["criteria"],
            "tasks": [{"store_id": s["id"], "search_query": s["search"]} for s in d["stores"]]}})
        for s in d["stores"]:
            out.append({"type": "store.status", "store_id": s["id"], "status": "queued"})
    elif k == "sandbox":
        if d["state"] == "starting":
            out.append({"type": "store.status", "store_id": d["store"],
                        "status": "starting" if d["mode"] == "hunt" else "verifying",
                        "message": f"Fresh sandbox {d['sandbox']}"})
        elif d["state"] == "running":
            out.append({"type": "store.status", "store_id": d["store"],
                        "status": "browsing" if d["mode"] == "hunt" else "verifying"})
    elif k == "step":
        a = d.get("action") or {}
        act = {"type": ACTION.get(a.get("action"), "scroll")}
        if a.get("i") is not None:
            act["target"] = f"[{a['i']}]"
        if a.get("url"):
            act["target"] = a["url"]
        if a.get("text"):
            act["text"] = str(a["text"])[:200]
        if act["type"] == "retry":
            act["text"] = str(a.get("thought", "retrying"))[:200]
        out.append({"type": "store.action", "store_id": d["store"], "step": d["step"], "action": act,
                    "allowed": bool(d.get("allowed")),
                    **({"approved": d["approved"]} if d.get("approved") is not None else {}),
                    **({"reason": d["blocked_reason"]} if d.get("blocked_reason") else
                       ({"reason": a.get("thought", "")[:200]} if a.get("thought") else {}))})
        if d.get("screenshot"):
            out.append({"type": "store.screenshot", "store_id": d["store"], "url": shot_url(hunt.id, d["screenshot"])})
    elif k == "approval":
        if d["state"] == "required":
            a = d.get("action") or {}
            act = {"type": ACTION.get(a.get("action"), "click")}
            if a.get("i") is not None:
                act["target"] = f"[{a['i']}]"
            if a.get("url"):
                act["target"] = a["url"]
            out.append({"type": "approval.required", "approval_id": d["id"], "store_id": d["store"],
                        "step": d.get("step", 0), "action": act, "reason": d.get("reason", ""),
                        "screenshot_url": shot_url(hunt.id, d.get("screenshot")), "timeout_s": d.get("timeout_s", 60)})
        else:
            out.append({"type": "approval.resolved", "approval_id": d["id"], "store_id": d["store"],
                        "approved": d["state"] == "approved", "by": d.get("by", "")})
    elif k == "offer_seen":
        out.append({"type": "store.status", "store_id": d["store"], "status": "extracting"})
    elif k == "scout_result":
        if d.get("mode", "hunt") == "hunt":
            st = {"ok": "done", "partial": "done", "compromised_demo": "blocked"}.get(d["status"], "failed")
            out.append({"type": "store.status", "store_id": d["store"], "status": st,
                        **({"message": d["reason"][:200]} if d.get("reason") else {})})
        else:
            out.append({"type": "store.status", "store_id": d["store"], "status": "done", "message": "re-verified"})
    elif k == "deal":
        o = offer_out(hunt.id, d)
        out.append({"type": "offer.found", "offer": o})
        out.append({"type": "verdict.ready", "offer_id": o["id"], "trust": o["trust"]})
    elif k == "reverify":
        deal = next((x for x in (hunt.result or {}).get("deals", []) if x["store"] == d["store"]), None) \
            or next((x for x in hunt.deals if x["store"] == d["store"]), None)
        if deal:
            o = offer_out(hunt.id, deal)
            out.append({"type": "offer.found", "offer": o})
            out.append({"type": "verdict.ready", "offer_id": o["id"], "trust": o["trust"]})
    elif k == "security":
        out.append({"type": "security.event", **security_out(d["event"])})
    elif k == "result":
        ids = [offer_id(hunt.id, x["store"]) for x in d["deals"] if x.get("rank")]
        for x in d["deals"]:  # final state of every offer (audit may have changed after re-verify)
            o = offer_out(hunt.id, x)
            out.append({"type": "offer.found", "offer": o})
            out.append({"type": "verdict.ready", "offer_id": o["id"], "trust": o["trust"]})
        out.append({"type": "ranking.ready", "ranking": ids, "summary_md": d["explanation"]["explanation"]})
    elif k == "metrics":
        out.append({"type": "metrics", "llm_calls": d["calls"], "tokens": d["prompt_tokens"] + d["completion_tokens"],
                    "cost_usd": d["cost_usd"], "sandbox_seconds": round(hunt.sandbox_seconds(), 1)})
    return out
