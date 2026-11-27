"""Guard (step 5): checks every single scout step before it runs.

Three layers, all logged to the security scoreboard:
  1. Egress proxy (in the sandbox, see sandbox/proxy) - only store domains,
     no cloud metadata, no private IPs.
  2. Action firewall (here, code) - checkout, login, payment, account creation
     and off-domain navigation are refused.
  3. Injection check (here) - heuristics plus a safety model scan page text,
     including text hidden from humans, for instructions aimed at the agent.
"""
import re
from urllib.parse import urlsplit

from . import config, llm, stores

# Never allowed, not even with human approval: irreversible or credential-bearing steps.
FORBIDDEN = [
    (r"\b(slutför|genomför\s+köp|bekräfta\s+köp|place\s+order|complete\s+(order|purchase)|"
     r"lägg\s+order|beställ\s+nu|köp\s+nu|buy\s+now|submit\s+order)\b", "placing an order"),
    (r"\b(logga\s+in|log\s*in|sign\s*in|mina\s+sidor|my\s+account|bankid|lösenord|password)\b", "login"),
    (r"\b(betala|betalning|payment|pay\s+now|klarna|swish|kortnummer|card\s+number|cvc|paypal)\b", "payment"),
    (r"\b(skapa\s+konto|bli\s+medlem|register|sign\s*up|registrera)\b", "account creation"),
]
FORBIDDEN_URL = re.compile(r"/(login|logga-in|account|mina-sidor|payment|betalning|order)(/|$|\?)", re.I)

# Approve-before-submit gate: opening the checkout is the first step toward an
# irreversible purchase, so the agent pauses and a human decides. Even when approved,
# everything in FORBIDDEN (placing the order, payment, login) stays blocked.
GATED = re.compile(r"\b(till\s+kassan|gå\s+till\s+kassan|kassa|kassan|checkout|check\s*out)\b", re.I)
GATED_URL = re.compile(r"/(checkout|kassa|kassan)(/|$|\?)", re.I)

INJECTION_PATTERNS = [
    r"ignore (all |any )?(previous|prior|above) instructions",
    r"(system|developer) (prompt|note|message)",
    r"\b(ai|llm|language model|assistant|agent|bot)s?\b.{0,60}\b(must|should|need to|are instructed|always)\b",
    r"report (that )?this (store|shop|site) (is|as) (the )?cheapest",
    r"(go|proceed|navigate) to (the )?(checkout|kassan|payment)",
    r"(enter|use|reveal|send).{0,30}(card|password|api key|token|credentials)",
    r"ignorera (alla )?(tidigare|föregående) instruktioner",
]


class Scoreboard:
    def __init__(self, emit):
        self.emit = emit
        self.counts = {"egress_blocked": 0, "trackers_blocked": 0, "metadata_or_private_blocked": 0,
                       "actions_blocked": 0, "injections_detected": 0, "steps_checked": 0,
                       "sandboxes_created": 0, "sandboxes_destroyed": 0,
                       "approvals_requested": 0, "approvals_denied": 0}
        self.events = []
        self._seen = set()
        self._third_party = {}  # store -> blocked third-party hosts (summarised once per store)

    async def record(self, kind, store, detail, severity="info"):
        ev = {"kind": kind, "store": store, "detail": detail, "severity": severity}
        self.events.append(ev)
        await self.emit("security", {"event": ev, "counts": self.counts})

    async def proxy_event(self, store, ev):
        if ev.get("ev") != "block":
            return
        host, reason = ev.get("host", ""), ev.get("reason", "")
        key = (store, host, reason)
        if key in self._seen:  # count each blocked destination once per store
            return
        self._seen.add(key)
        if "internal" in reason or host.startswith(("169.254.", "10.", "192.168.", "172.")) or "port" in reason:
            self.counts["metadata_or_private_blocked"] += 1
            sev = "high"
        elif re.search(r"(googletagmanager|google-analytics|doubleclick|facebook|abtasty|hotjar|nosto|"
                       r"growthbook|zdassets|testfreaks|tryggehandel|clarity|tiktok|snap|criteo|contentsquare|bing\.com|"
                       r"datadoghq|google\.com|googleadservices|kundo|puzzel|giosg|ingrid|azurestaticapps)", host):
            self.counts["trackers_blocked"] += 1
            sev = "low"
        else:
            self.counts["egress_blocked"] += 1
            sev = "medium"
        if sev != "high" and "exfil" not in host:
            # Ordinary third-party requests (trackers, chat widgets, CDNs) are blocked silently
            # and summarised once per store; only real attacks are reported one by one.
            self._third_party.setdefault(store, []).append(host)
            return
        await self.record("egress_blocked", store, f"{host}: {reason}", sev)

    async def summarize_third_party(self, store):
        hosts = self._third_party.pop(store, [])
        if hosts:
            shown = ", ".join(hosts[:5]) + (f" and {len(hosts) - 5} more" if len(hosts) > 5 else "")
            await self.record("third_party_summary", store,
                              f"{len(hosts)} third-party requests blocked (trackers, chat widgets, other sites): {shown}",
                              "low")


def check_action(store_id, action, elements):
    """Action firewall. Returns (allowed, reason); gated actions count as not allowed."""
    verdict, reason = classify_action(store_id, action, elements)
    return verdict == "allow", reason


def classify_action(store_id, action, elements):
    """Action firewall with three outcomes: ("allow"|"gate"|"block", reason).
    "gate" means the action needs a human's approval before it may run."""
    kind = action.get("action")
    if kind in ("goto",):
        url = action.get("url", "")
        host = urlsplit(url).hostname or ""
        if urlsplit(url).scheme not in ("http", "https"):
            return "block", f"non-web URL scheme: {url[:80]}"
        if not stores.host_allowed(store_id, host):
            return "block", f"navigation outside the store's domains: {host}"
        if FORBIDDEN_URL.search(url):
            return "block", f"forbidden page (login/account/payment/order): {url[:100]}"
        if GATED_URL.search(url):
            return "gate", f"opening the checkout needs your approval: {url[:100]}"
    if kind in ("click", "type"):
        i = action.get("i")
        el = next((e for e in elements if e.get("i") == i), None)
        if el is None:
            return "block", f"element [{i}] does not exist on this page"
        label = f"{el.get('name', '')} {el.get('href', '') or ''}"
        for pat, what in FORBIDDEN:
            if re.search(pat, label, re.I):
                return "block", f"{what} is not allowed: [{i}] '{el.get('name', '')[:60]}'"
        if el.get("href") and FORBIDDEN_URL.search(el["href"]):
            return "block", f"link leads to a forbidden page: {el['href'][:100]}"
        if el.get("href"):
            host = urlsplit(el["href"]).hostname or ""
            if host and not stores.host_allowed(store_id, host):
                return "block", f"link leaves the store's domains: {host}"
        if kind == "click" and (GATED.search(el.get("name", "")) or (el.get("href") and GATED_URL.search(el["href"]))):
            return "gate", f"opening the checkout needs your approval: [{i}] '{el.get('name', '')[:60]}'"
        if kind == "type":
            text = str(action.get("text", ""))
            digits = re.sub(r"[\s.\-/]", "", text)
            if re.search(r"\d{10,19}", digits) or re.search(r"@|password|lösen|cvc|cvv", text, re.I):
                return "block", "typing personal or payment data is not allowed"
            if el.get("role") in ("password", "email", "tel"):
                return "block", f"typing into a {el.get('role')} field is not allowed"
    return "allow", ""


def heuristic_injection(text):
    """Returns at most one snippet: the whole region around all pattern hits."""
    spans = [m.span() for pat in INJECTION_PATTERNS for m in [re.search(pat, text, re.I)] if m]
    if not spans:
        return []
    s, e = max(0, min(a for a, _ in spans) - 60), max(b for _, b in spans) + 160
    return [text[s:e].replace("\n", " ")]


async def injection_check(page, metrics):
    """Returns list of suspicious snippets (empty = clean)."""
    hidden = " \n".join(page.get("hidden_text", []))
    visible = page.get("text", "")
    findings = [("hidden", h) for h in heuristic_injection(hidden)]
    findings += [("visible", h) for h in heuristic_injection(visible)]
    # Hidden text that talks to agents is suspicious even without a known phrase.
    for t in page.get("hidden_text", []):
        if re.search(r"\b(ai|llm|agent|assistant|bot|instruction|instruktion|ignore|ignorera)\b", t, re.I) \
                and not any(t[:60] in f[1] for f in findings):
            findings.append(("hidden", t[:400]))
    # The safety model is a second opinion on what the rules found (on its own it flags
    # ordinary medicine names as unsafe), so it can only raise confidence, not add findings.
    confirmed = []
    for where, snippet in findings[:6]:
        tag = where
        try:
            verdict = await llm.chat(config.SAFETY_MODEL, [{"role": "user", "content": snippet[:2000]}],
                                     metrics, max_tokens=20, temperature=0)
            if "unsafe" in verdict.lower():
                tag = f"{where}, confirmed by safety model"
        except Exception:
            pass
        confirmed.append((tag, snippet))
    return confirmed
