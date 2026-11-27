"""Planner agent (step 2): turns the ask into a plan. Large model.

The LLM proposes criteria and search terms; code validates the plan against
the store registry, so the plan can never name a store or domain we don't know.
"""
from urllib.parse import quote_plus

from . import config, llm, stores

SYSTEM = """You are the planner of BlackBear, a price-hunting agent for Swedish online stores.
Turn the shopper's request into a search plan. Output ONLY JSON:
{
  "product": "<canonical product name>",
  "brand": "<brand or null>",
  "size": "<pack size as on the shelf, e.g. '0,5 g', or null>",
  "criteria": ["same product", "<size>", "in stock", ...],
  "accept_alternatives": false,
  "stores": [{"id": "<store id>", "search": "<search phrase for that store, Swedish>"}],
  "notes": "<one short sentence>"
}
Rules: pick stores only from the list given. Prefer all stores that plausibly sell the product.
Keep search phrases short (2-4 words). Do not invent prices."""


def add_demo_store(plan, sid="trapshop"):
    st = stores.STORES[sid]
    if sid not in [s["id"] for s in plan["stores"]]:
        plan["stores"].append({"id": sid, "name": st["name"], "search": plan["product"],
                               "start_url": st["search_url"].format(q=quote_plus(plan["product"])),
                               "allow": st["allow"], "demo": True})
    return plan


async def make_plan(query, quantity, memberships, metrics):
    catalog = "\n".join(f"- {sid}: {stores.STORES[sid]['name']} (memberships: "
                        f"{', '.join(stores.STORES[sid]['memberships']) or 'none'})" for sid in stores.PLANNER_STORES)
    user = (f"Request: {query}\nQuantity: {quantity}\n"
            f"Shopper memberships: {', '.join(memberships) or 'none'}\n\nStores:\n{catalog}")
    raw = await llm.chat_json(config.PLANNER_MODEL,
                              [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                              metrics, max_tokens=1200)
    return validate(raw, query, quantity, memberships)


def validate(raw, query, quantity, memberships):
    picked = []
    for s in raw.get("stores", []) or []:
        sid = str(s.get("id", "")).strip().lower()
        if sid in stores.PLANNER_STORES and sid not in [p["id"] for p in picked]:
            search = str(s.get("search") or raw.get("product") or query)[:80]
            picked.append({"id": sid, "name": stores.STORES[sid]["name"], "search": search,
                           "start_url": stores.STORES[sid]["search_url"].format(q=quote_plus(search)),
                           "allow": stores.STORES[sid]["allow"]})
    if not picked:  # fall back to every store
        for sid in stores.PLANNER_STORES:
            st = stores.STORES[sid]
            picked.append({"id": sid, "name": st["name"], "search": query[:80],
                           "start_url": st["search_url"].format(q=quote_plus(query[:80])), "allow": st["allow"]})
    criteria = [str(c)[:80] for c in (raw.get("criteria") or [])][:8] or ["same product", "in stock"]
    return {
        "query": query, "quantity": int(quantity), "memberships": list(memberships),
        "product": str(raw.get("product") or query)[:120], "brand": raw.get("brand"),
        "size": raw.get("size"), "criteria": criteria,
        "accept_alternatives": bool(raw.get("accept_alternatives", False)),
        "stores": picked, "notes": str(raw.get("notes") or "")[:300],
    }
