"""Store registry. The planner may only pick stores from here, and the egress
allowlist comes from here, never from the LLM: a tricked planner cannot widen
what a sandbox can reach. Trackers are deliberately left out (they show up as
blocks on the security scoreboard).
"""

STORES = {
    "apotekhjartat": {
        "name": "Apotek Hjärtat",
        "home": "https://www.apotekhjartat.se/",
        "search_url": "https://www.apotekhjartat.se/sok/?q={q}",
        "allow": ["*.apotekhjartat.se", "apotekhjartat.se", "cdn.cookielaw.org",
                  "geolocation.onetrust.com", "cdn.jsdelivr.net", "assets.icanet.se"],
        "memberships": ["Stammis"],
        "shipping_note": "Check shipping cost in the cart; free shipping above a threshold is common.",
    },
    "apoteket": {
        "name": "Apoteket",
        "home": "https://www.apoteket.se/",
        "search_url": "https://www.apoteket.se/sok/?q={q}",
        "allow": ["*.apoteket.se", "apoteket.se", "apoteket.imagevault.app", "consent.cookiebot.com",
                  "consentcdn.cookiebot.com", "cdn.ingrid.com", "connect.nosto.com", "apoteket-se.54proxy.com"],
        "memberships": ["Apotekets kundklubb"],
        "shipping_note": "",
    },
    "kronans": {
        "name": "Kronans Apotek",
        "home": "https://www.kronansapotek.se/",
        "search_url": "https://www.kronansapotek.se/search?q={q}",
        "allow": ["*.kronansapotek.se", "kronansapotek.se", "images.ctfassets.net", "consent.cookiebot.eu",
                  "consentcdn.cookiebot.eu", "*.esales.apptus.cloud", "cdn.growthbook.io", "assets.kronansapotek.io"],
        "memberships": ["Kronans kundklubb"],
        "shipping_note": "",
    },
    "apotea": {
        "name": "Apotea",
        "home": "https://www.apotea.se/",
        "search_url": "https://www.apotea.se/search.html?q={q}",
        "allow": ["*.apotea.se", "apotea.se", "consent.cookiebot.com", "consentcdn.cookiebot.com"],
        "memberships": [],
        "shipping_note": "Advertises free shipping.",
    },
}

# Opt-in demo store: a deliberately hostile page served by our own backend, used to
# show containment on video. Never offered to the planner; added only when requested.
DEMO_STORES = {
    "trapshop": {
        "name": "Fyndbutiken (hostile demo)",
        "home": "https://70-34-209-197.sslip.io/trap/",
        "search_url": "https://70-34-209-197.sslip.io/trap/?q={q}",
        "allow": ["70-34-209-197.sslip.io"],
        "memberships": [],
        "shipping_note": "",
    },
}
STORES.update(DEMO_STORES)
PLANNER_STORES = [k for k in STORES if k not in DEMO_STORES]

ALL_MEMBERSHIPS = sorted({m for s in STORES.values() for m in s["memberships"]})


def host_allowed(store_id, host):
    host = (host or "").lower().rstrip(".")
    for a in STORES[store_id]["allow"]:
        if a.startswith("*."):
            if host == a[2:] or host.endswith(a[1:]):
                return True
        elif host == a:
            return True
    return False
