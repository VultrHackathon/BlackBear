"""Compare agent (step 8): the large model explains the ranking that code computed.

A number check rejects any explanation that mentions a number the code did not
compute (or that the shopper did not give). One retry with feedback, then a
code-written fallback explanation.
"""
import json
import re

from . import config, llm

SYSTEM = """You are BlackBear's compare agent. You get offers whose prices were computed by code.
Explain the ranking to the shopper in 2-4 short sentences, in English.
Rules:
- Use ONLY numbers that appear in the data. Never compute, round or estimate new numbers.
- Write prices like "62 kr" exactly as given.
- Say which store is cheapest for THIS shopper (your_total), and why.
- Mention member-only promos that the shopper cannot use, and any trust warnings (audit label).
Output ONLY JSON: {"explanation": "..."}"""

NUM_RE = re.compile(r"(?<![\w.])(\d+(?:[.,]\d+)?)(?![\w])")


def _collect(obj, out):
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        out.add(round(float(obj), 2))
    elif isinstance(obj, str):
        for m in NUM_RE.finditer(obj):
            out.add(round(float(m.group(1).replace(",", ".")), 2))
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k not in ("evidence", "product_url", "screenshot"):
                _collect(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _collect(v, out)


def allowed_numbers(deals, plan):
    out = set()
    _collect(deals, out)
    _collect({"q": plan["quantity"], "query": plan["query"], "size": plan.get("size"),
              "product": plan.get("product")}, out)
    out.update(float(i) for i in range(0, len(deals) + 2))  # ranks / counts
    return out


def unknown_numbers(text, allowed):
    bad = []
    for m in NUM_RE.finditer(text):
        v = round(float(m.group(1).replace(",", ".")), 2)
        if not any(abs(v - a) < 0.011 for a in allowed):
            bad.append(m.group(1))
    return bad


def _slim(d):
    keys = ["rank", "store_name", "product_name", "size", "quantity", "unit_price", "guest_total", "member_items_total",
            "member_promo", "member_promo_membership", "your_total", "your_unit_price", "applied_promo", "shipping",
            "shipping_note", "cart_total", "reverify"]
    s = {k: d.get(k) for k in keys if d.get(k) is not None}
    s["audit"] = d["audit"]
    return s


def fallback(deals, plan):
    ranked = [d for d in deals if d.get("rank")]
    if not ranked:
        return "No store returned a usable, cart-verified offer for this product."
    best = ranked[0]
    txt = f"{best['store_name']} is cheapest for you at {best['your_total']:g} kr for {plan['quantity']}."
    for d in deals:
        if d.get("member_items_total") is not None and d.get("member_promo_membership") not in plan["memberships"]:
            txt += (f" {d['store_name']}'s {d['member_items_total']:g} kr only applies if you're a "
                    f"{d['member_promo_membership']} member.")
    warn = [d for d in deals if d["audit"]["label"] in ("questionable", "mismatch")]
    if warn:
        txt += " Trust warnings: " + "; ".join(f"{d['store_name']}: {d['audit']['label']}" for d in warn) + "."
    return txt


async def explain(deals, plan, metrics):
    data = {"shopper": {"quantity": plan["quantity"], "memberships": plan["memberships"] or ["none"]},
            "offers": [_slim(d) for d in deals]}
    allowed = allowed_numbers(data, plan)
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": json.dumps(data, ensure_ascii=False)}]
    rejected = []
    for _ in range(2):
        try:
            out = await llm.chat_json(config.COMPARE_MODEL, msgs, metrics, max_tokens=900)
            text = str(out.get("explanation", "")).strip()
        except Exception as e:
            rejected.append({"text": "", "bad_numbers": [], "error": str(e)[:200]})
            continue
        bad = unknown_numbers(text, allowed)
        if text and not bad:
            return {"explanation": text, "source": "llm", "rejected": rejected}
        rejected.append({"text": text, "bad_numbers": bad})
        msgs += [{"role": "assistant", "content": json.dumps(out, ensure_ascii=False)},
                 {"role": "user", "content": f"Rejected: these numbers are not in the data: {bad}. "
                                             "Rewrite using only numbers from the data."}]
    return {"explanation": fallback(deals, plan), "source": "code-fallback", "rejected": rejected}
