"""Deal math (step 6) and discount auditor (step 7). Pure code, no LLM.

Promos become structured rules; code computes the effective price for the
shopper's quantity and memberships, including shipping. The auditor compares
what was advertised with what the guest cart actually charged.
"""
import re

from . import stores

NUM = r"(\d+(?:[.,]\d{1,2})?)"


def num(x):
    if x is None or x == "":
        return None
    if isinstance(x, (int, float)):
        return float(x)
    m = re.search(r"-?\d+(?:[  ]\d{3})*(?:[.,]\d{1,2})?", str(x))
    if not m:
        return None
    return float(m.group(0).replace(" ", "").replace(" ", "").replace(",", "."))


def parse_promo(text):
    """Swedish promo text -> rule dict, or None if not understood."""
    t = (text or "").lower().replace(" ", " ")
    m = re.search(r"(\d+)\s*(?:st\s*)?för\s*(\d+)(?!\s*(?:kr|:-|sek|[.,]\d))\b", t)  # "3 för 2"
    if m and int(m.group(1)) > int(m.group(2)):
        return {"type": "x_for_y", "x": int(m.group(1)), "y": int(m.group(2))}
    m = re.search(r"(\d+)\s*(?:st\s*)?för\s*" + NUM + r"\s*(?:kr|:-|sek)?", t)  # "2 för 49 kr"
    if m:
        return {"type": "multibuy", "n": int(m.group(1)), "price": num(m.group(2))}
    m = re.search(r"(\d+)\s*%", t)  # "20 % rabatt", "-20%"
    if m:
        mq = re.search(r"(?:köp|vid köp av|minst)\s*(\d+)", t)
        return {"type": "percent", "pct": float(m.group(1)), "min_qty": int(mq.group(1)) if mq else 1}
    m = re.search(r"(?:nu|endast|just nu)\s*" + NUM + r"\s*(?:kr|:-)", t)
    if m:
        return {"type": "fixed", "price": num(m.group(1))}
    return None


def promo_membership(store_id, promo):
    """Which membership (if any) a promo needs."""
    text = f"{promo.get('text', '')} {promo.get('label') or ''}".lower()
    for mname in stores.STORES.get(store_id, {}).get("memberships", []):
        root = mname.lower().split()[0]
        if root in text:
            return mname
    if re.search(r"medlem|klubb|member|stammis", text):
        ms = stores.STORES.get(store_id, {}).get("memberships", [])
        return ms[0] if ms else "member"
    if promo.get("members_only"):
        ms = stores.STORES.get(store_id, {}).get("memberships", [])
        return ms[0] if ms else "member"
    return None


def apply_rule(rule, qty, unit):
    if rule["type"] == "multibuy" and rule.get("n") and rule.get("price") is not None:
        n = rule["n"]
        return (qty // n) * rule["price"] + (qty % n) * unit
    if rule["type"] == "x_for_y":
        x, y = rule["x"], rule["y"]
        return (qty // x) * y * unit + (qty % x) * unit
    if rule["type"] == "percent" and qty >= rule.get("min_qty", 1):
        return qty * unit * (1 - rule["pct"] / 100)
    if rule["type"] == "fixed" and rule.get("price") is not None:
        return qty * rule["price"]
    return qty * unit


def shipping_for(items_total, shipping, *, cart=None, quantity=None):
    cart = cart or {}
    cart_fee = num(cart.get("shipping"))
    cart_total = num(cart.get("total"))
    # The guest cart quote applies only to the same quantity and merchandise total.
    if (cart_fee is not None and cart_fee >= 0 and num(cart.get("quantity")) == quantity
            and quantity is not None and r2(cart_total) == r2(items_total)):
        return cart_fee, "cart fee"

    shipping = shipping or {}
    fee, free_over = num(shipping.get("fee")), num(shipping.get("free_over"))
    if free_over is not None and items_total >= free_over:
        return 0.0, f"free over {free_over:g} kr"
    if fee is None or fee < 0:
        return 0.0, "unknown (not included)"
    return fee, "fee"


def r2(x):
    return None if x is None else round(x + 1e-9, 2)


def compute_deal(result, quantity, memberships):
    """Returns the deal dict for one store result (or None if no usable offer)."""
    offer = result.get("offer") or {}
    unit = num(offer.get("unit_price"))
    if unit is None:
        return None
    sid = result["store"]
    rules = []
    for p in offer.get("promos") or []:
        rule = parse_promo(p.get("text", ""))
        if rule:
            rule["text"] = p.get("text")
            rule["label"] = p.get("label")
            rule["membership"] = promo_membership(sid, p)
            rules.append(rule)
    guest_items = quantity * unit
    member_items = guest_items
    your_items = guest_items
    applied_guest = applied_member = applied_you = None
    for rule in rules:
        total = apply_rule(rule, quantity, unit)
        if rule["membership"] is None and total < guest_items:
            guest_items, applied_guest = total, rule
        if total < member_items:
            member_items, applied_member = total, rule
        if (rule["membership"] is None or rule["membership"] in memberships) and total < your_items:
            your_items, applied_you = total, rule
    if guest_items < your_items:
        your_items, applied_you = guest_items, applied_guest
    cart = result.get("cart")
    ship_you, ship_note = shipping_for(your_items, offer.get("shipping"), cart=cart, quantity=quantity)
    ship_guest, _ = shipping_for(guest_items, offer.get("shipping"), cart=cart, quantity=quantity)
    deal = {
        "store": sid, "store_name": result.get("store_name"), "product_name": offer.get("product_name"),
        "size": offer.get("size"), "product_url": offer.get("product_url"), "quantity": quantity,
        "unit_price": r2(unit), "rules": rules,
        "guest_items_total": r2(guest_items), "guest_total": r2(guest_items + ship_guest),
        "member_items_total": r2(member_items) if applied_member and applied_member.get("membership") else None,
        "member_promo": (applied_member or {}).get("text") if applied_member and applied_member.get("membership") else None,
        "member_promo_membership": (applied_member or {}).get("membership") if applied_member else None,
        "your_items_total": r2(your_items),
        "shipping": None if ship_note.startswith("unknown") else r2(ship_you), "shipping_note": ship_note,
        "your_total": r2(your_items + ship_you), "your_unit_price": r2((your_items + ship_you) / quantity),
        "applied_promo": (applied_you or {}).get("text"),
        "was_price": r2(num(offer.get("was_price"))), "lowest_30d_price": r2(num(offer.get("lowest_30d_price"))),
        "in_stock": offer.get("in_stock"), "evidence": result.get("evidence", {}),
    }
    def guest_for(q):
        best = q * unit
        for rule in rules:
            if rule["membership"] is None:
                best = min(best, apply_rule(rule, q, unit))
        return best

    def member_for(q):
        return min([q * unit] + [apply_rule(r, q, unit) for r in rules])

    deal["cart_promo_applied"] = (result.get("cart") or {}).get("promo_applied")
    deal["_guest_for"], deal["_member_for"] = guest_for, member_for
    deal["audit"] = audit(deal, result.get("cart"))
    deal.pop("_guest_for"); deal.pop("_member_for")
    return deal


def audit(deal, cart):
    """Discount auditor: advertised vs cart, sale vs 30-day lowest. Code only."""
    findings, label = [], "verified"
    cart = cart or {}
    cart_total = num(cart.get("total"))
    deal["cart_total"] = r2(cart_total)
    if cart_total is None:
        label = "unverified"
        findings.append("Cart total could not be read, price is not cart-verified.")
    else:
        cart_qty = num(cart.get("quantity"))
        q = int(cart_qty) if cart_qty and cart_qty > 0 else deal["quantity"]
        deal["cart_quantity"] = q
        expected_guest = deal["_guest_for"](q) if "_guest_for" in deal else deal["guest_items_total"]
        expected_member = deal["_member_for"](q) if "_member_for" in deal else deal.get("member_items_total")
        if q != deal["quantity"]:
            findings.append(f"Cart held {q} instead of {deal['quantity']}; checked against the price for {q}.")
        if abs(cart_total - expected_guest) <= 0.5:
            findings.append(f"Guest cart total {cart_total:g} kr matches the computed guest price.")
            if deal.get("member_promo"):
                label = "questionable"
                findings.append(f"Promo '{deal['member_promo']}' was not applied in the guest cart "
                                f"(likely {deal.get('member_promo_membership') or 'members'} only).")
        elif deal.get("member_items_total") is not None and abs(cart_total - expected_member) <= 0.5:
            findings.append(f"Cart applied the member promo: {cart_total:g} kr.")
        elif cart_total > expected_guest + 0.5:
            label = "mismatch"
            findings.append(f"Cart charged {cart_total:g} kr, more than the advertised {expected_guest:g} kr.")
        else:
            label = "questionable"
            findings.append(f"Cart total {cart_total:g} kr differs from the computed {expected_guest:g} kr.")
    was, low, unit = deal.get("was_price"), deal.get("lowest_30d_price"), deal.get("unit_price")
    if was and low and low < was - 0.01:
        if label == "verified":
            label = "questionable"
        findings.append(f"Discount is shown from {was:g} kr, but the 30-day lowest price was {low:g} kr.")
    if was and low and unit is not None and unit >= low - 0.01:
        if label == "verified":
            label = "questionable"
        findings.append(f"Sale price {unit:g} kr is not below the 30-day lowest price {low:g} kr.")
    return {"label": label, "findings": findings}


def rank(deals):
    order = {"verified": 0, "questionable": 1, "unverified": 1, "mismatch": 3}
    usable, rest = [], []
    for deal in deals:
        if not deal:
            continue
        deal.pop("rank", None)
        if deal.get("shipping") is None or deal["audit"]["label"] == "mismatch" or deal.get("in_stock") is False:
            rest.append(deal)
        else:
            usable.append(deal)

    usable.sort(key=lambda d: (d["your_total"], order.get(d["audit"]["label"], 2)))
    for i, deal in enumerate(usable, 1):
        deal["rank"] = i
    return usable + rest
