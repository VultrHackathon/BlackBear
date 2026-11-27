"""Product matcher: is each offer the product the shopper asked for, or a different one?

"Alvedon 500 mg 20 st" and "Alvedon Novum 500 mg 20 st" share a brand and a strength
but are different products, so they must not be ranked against each other. Code
checks pack size; the planner model judges product line/variant. A different product
is shown under "Other recommended items" and never ranked.
"""
import re

from . import config, llm

SYSTEM = """You check whether shop offers are the SAME product the shopper asked for.
Same product = same brand, same product line/variant (e.g. "Alvedon" vs "Alvedon Novum" are DIFFERENT),
same strength and same pack size/amount. Store-specific wording, word order and capitalisation do not matter.
If the shopper's request is generic (no brand), any brand counts as the same product when the
product type and size match.
Output ONLY JSON: {"offers": [{"store": "<store id>", "same": true|false, "reason": "<max 12 words>"}]}"""

UNIT = r"(\d+(?:[.,]\d+)?)\s*(mg|g|kg|ml|l|st|stk|styck|tabletter|kapslar|µg|mcg)\b"


def _sizes(text):
    out = set()
    for n, u in re.findall(UNIT, (text or "").lower()):
        u = {"stk": "st", "styck": "st", "tabletter": "st", "kapslar": "st", "mcg": "µg"}.get(u, u)
        out.add((round(float(n.replace(",", ".")), 3), u))
    return out


def size_conflict(plan, deal):
    """Both sides name an amount in the same unit, and they differ."""
    want = _sizes(f"{plan.get('query', '')} {plan.get('size') or ''}")
    have = _sizes(f"{deal.get('product_name') or ''} {deal.get('size') or ''}")
    for n, u in want:
        same_unit = {m for m, v in have if v == u}
        if same_unit and n not in same_unit:
            return f"different amount: {n:g} {u} asked, {', '.join(f'{m:g} {u}' for m in same_unit)} offered"
    return None


async def classify(plan, deals, metrics):
    """Sets deal["match"] = "same" | "other" and deal["match_reason"] on every deal."""
    for d in deals:
        d["match"], d["match_reason"] = "same", ""
        conflict = size_conflict(plan, d)
        if conflict:
            d["match"], d["match_reason"] = "other", conflict
    todo = [d for d in deals if d["match"] == "same"]
    if len(todo) == 0:
        return deals
    ask = {"request": plan.get("query"), "product": plan.get("product"), "brand": plan.get("brand"),
           "size": plan.get("size"),
           "offers": [{"store": d["store"], "product": d.get("product_name"), "size": d.get("size")} for d in todo]}
    try:
        out = await llm.chat_json(config.PLANNER_MODEL, [{"role": "system", "content": SYSTEM},
                                                         {"role": "user", "content": str(ask)}],
                                  metrics, max_tokens=700)
        verdicts = {str(v.get("store")): v for v in out.get("offers", []) if isinstance(v, dict)}
    except Exception:
        return deals  # fail open to "same": the auditor and the evidence still apply
    for d in todo:
        v = verdicts.get(d["store"])
        if v is not None and v.get("same") is False:
            d["match"], d["match_reason"] = "other", str(v.get("reason") or "a different product")[:120]
    return deals
