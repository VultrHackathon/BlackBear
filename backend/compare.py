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
- Say which ranked offer has the lowest total (your_total) among the offers compared.
- Limit price and availability claims to the evidence provided.
- An offer with shipping_pending has an item subtotal, and its total cost is unknown.
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
    if d.get("shipping") is None:
        s.pop("your_total", None)
        s.pop("your_unit_price", None)
        s["your_items_total"] = d["your_items_total"]
        s["shipping_pending"] = True
    s["audit"] = d["audit"]
    return s


def evidence_gaps(deals, scout_results):
    """Group missing or conflicting evidence by what the shopper still needs to know."""
    by_reason = {}

    def record(reason, store):
        names = by_reason.setdefault(reason, [])
        if store not in names:
            names.append(store)

    stores_with_deals = {deal["store"] for deal in deals}
    for result in scout_results:
        if result["store"] in stores_with_deals or result["status"] == "compromised_demo":
            continue
        if result["status"] == "not_found" and not result.get("offer"):
            continue
        record("Store check did not produce usable price evidence", result.get("store_name") or result["store"])

    for deal in deals:
        if deal.get("in_stock") is False:
            continue
        store = deal.get("store_name") or deal["store"]
        cart_total = deal.get("cart_total")
        recheck = deal.get("reverify") or {}
        status = recheck.get("status")
        screenshots = (deal.get("evidence") or {}, recheck.get("evidence") or {})
        previous_price = deal.get("was_price")
        checks = (
            ("Shipping cost was unavailable", deal.get("shipping") is None),
            ("Stock availability was unconfirmed", deal.get("in_stock") is None),
            ("Cart total was unavailable", cart_total is None),
            ("Cart was checked for a different quantity",
             cart_total is not None and deal.get("cart_quantity") != deal["quantity"]),
            ("Cart and advertised prices conflicted", deal["audit"]["label"] == "mismatch"),
            ("Price screenshot was unavailable", not any(s.get("cart") or s.get("product") for s in screenshots)),
            ("The advertised discount could not be checked against a 30-day price",
             previous_price is not None and previous_price > deal["unit_price"]
             and deal.get("lowest_30d_price") is None),
            ("The price re-check failed", status == "failed"),
            ("The re-check disagreed with the original price or cart", status == "changed"),
            ("The re-check did not capture a cart total", status == "same" and recheck.get("cart_total") is None),
        )
        for reason, missing in checks:
            if missing:
                record(reason, store)

    return [f"{reason} at {', '.join(stores)}." for reason, stores in by_reason.items()]


def fallback(deals, plan):
    ranked = [d for d in deals if d.get("rank")]
    if not ranked:
        return "No offer could be ranked with the available price and shipping evidence."
    best = ranked[0]
    txt = (f"Among the ranked offers, {best['store_name']} has the lowest total at "
           f"{best['your_total']:g} kr for {best['quantity']}.")
    for d in deals:
        if d.get("member_items_total") is not None and d.get("member_promo_membership") not in plan["memberships"]:
            txt += (f" {d['store_name']}'s {d['member_items_total']:g} kr only applies if you're a "
                    f"{d['member_promo_membership']} member.")
    warn = [d for d in deals if d["audit"]["label"] in ("questionable", "mismatch")]
    if warn:
        txt += " Trust warnings: " + "; ".join(f"{d['store_name']}: {d['audit']['label']}" for d in warn) + "."
    return txt


async def explain(deals, plan, metrics, *, scout_results=()):
    gaps = evidence_gaps(deals, scout_results)
    if gaps or not any(d.get("rank") for d in deals):
        explanation = fallback(deals, plan)
        if gaps:
            notes = "\n".join(f"- {gap}" for gap in gaps)
            explanation += f"\n\n**Evidence is incomplete.**\n\n{notes}"
        return {"explanation": explanation, "source": "code-fallback", "rejected": []}

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
