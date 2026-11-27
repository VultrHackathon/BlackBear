"""BlackBear browser worker. Runs INSIDE the sandbox container.

Protocol: one JSON command per line on stdin, one JSON reply per line on stdout.
The container holds no secrets and can only reach the egress proxy.
"""
import base64
import json
import os
import sys
import traceback

from playwright.sync_api import sync_playwright

PROXY = os.environ.get("BB_PROXY", "http://bbproxy:3128")
MAX_ELEMENTS = int(os.environ.get("BB_MAX_ELEMENTS", "150"))

# Numbers every visible interactive element and returns an accessibility-style list.
OBSERVE_JS = r"""
(maxEls) => {
  document.querySelectorAll('[data-bb-id]').forEach(e => e.removeAttribute('data-bb-id'));
  const sel0 = '[role=dialog] *,[aria-modal=true] *,dialog *';
  const sel = 'a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[onclick],summary';
  const out = [];
  const vh = window.innerHeight;
  const all = Array.from(document.querySelectorAll(sel));
  const inDialog = new Set(Array.from(document.querySelectorAll(sel0)));
  const score = el => { const r = el.getBoundingClientRect();
    return (inDialog.has(el) ? 0 : 2) + ((r.top >= 0 && r.top < vh) ? 0 : 1); };
  all.sort((a, b) => score(a) - score(b));
  for (const el of all) {
    if (out.length >= maxEls) break;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < -vh * 0.5 || r.top > vh * 2.5) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') continue;
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder ||
                  el.title || (el.querySelector('img') && el.querySelector('img').alt) || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const i = out.length;
    el.setAttribute('data-bb-id', String(i));
    out.push({
      i, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || el.type || '',
      name, href: el.getAttribute('href') ? el.href.slice(0, 200) : undefined,
      inView: r.top >= 0 && r.top < vh,
    });
  }
  return out;
}
"""


def reply(obj):
    # gVisor's stdio pipe stalls on single writes > 64 KB, so write in small chunks.
    data = (json.dumps(obj) + "\n").encode()
    for i in range(0, len(data), 16384):
        chunk = data[i:i + 16384]
        while chunk:
            n = os.write(1, chunk)
            chunk = chunk[n:]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            proxy={"server": PROXY},
            args=["--disable-dev-shm-usage", "--no-first-run", "--disable-extensions",
                  "--disable-background-networking", "--disable-sync"],
        )
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 900}, locale="sv-SE", timezone_id="Europe/Stockholm",
            user_agent=("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/131.0.0.0 Safari/537.36"),
            accept_downloads=False, ignore_https_errors=False,
        )
        page = ctx.new_page()
        page.set_default_timeout(15000)
        reply({"ok": True, "ready": True})

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
                c = cmd.get("cmd")
                if c == "goto":
                    page.goto(cmd["url"], wait_until="domcontentloaded", timeout=30000)
                    settle(page)
                    reply({"ok": True})
                elif c == "observe":
                    reply({"ok": True, **observe(page, cmd.get("screenshot", True))})
                elif c == "click":
                    loc = page.locator(f'[data-bb-id="{int(cmd["i"])}"]').first
                    loc.scroll_into_view_if_needed(timeout=5000)
                    loc.click(timeout=8000)
                    settle(page)
                    reply({"ok": True})
                elif c == "type":
                    loc = page.locator(f'[data-bb-id="{int(cmd["i"])}"]').first
                    loc.fill(str(cmd.get("text", ""))[:200], timeout=8000)
                    if cmd.get("submit"):
                        loc.press("Enter")
                    settle(page)
                    reply({"ok": True})
                elif c == "scroll":
                    page.mouse.wheel(0, int(cmd.get("dy", 700)))
                    page.wait_for_timeout(600)
                    reply({"ok": True})
                elif c == "back":
                    page.go_back(wait_until="domcontentloaded")
                    settle(page)
                    reply({"ok": True})
                elif c == "close":
                    reply({"ok": True})
                    break
                else:
                    reply({"ok": False, "error": f"unknown cmd {c}"})
            except Exception as e:  # report, never crash the loop
                reply({"ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}",
                       "trace": traceback.format_exc()[-500:]})
        browser.close()


CONSENT = [
    "#onetrust-accept-btn-handler", "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept", "button#accept-all", "[data-testid=cookie-accept-all]",
    "button:has-text('Acceptera alla')", "button:has-text('Godkänn alla')", "button:has-text('Tillåt alla')",
    "button:has-text('Acceptera')", "button:has-text('Jag godkänner')",
]


def dismiss_consent(page):
    """Accept cookie banners in code so scouts don't waste steps (no personal data involved)."""
    for sel in CONSENT:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=300):
                loc.click(timeout=2000)
                page.wait_for_timeout(400)
                return sel
        except Exception:
            continue
    return None


def settle(page):
    try:
        page.wait_for_load_state("networkidle", timeout=4000)
    except Exception:
        pass
    page.wait_for_timeout(500)
    dismiss_consent(page)


def observe(page, with_shot=True):
    els = page.evaluate(OBSERVE_JS, MAX_ELEMENTS)
    text = page.evaluate("() => document.body ? document.body.innerText : ''") or ""
    # hidden text is where injected instructions like to live; collect it separately
    hidden = page.evaluate(r"""() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        if (out.length > 40) break;
        if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH','IFRAME'].includes(el.tagName.toUpperCase())) continue;
        const st = getComputedStyle(el);
        const t = (el.childElementCount === 0 ? el.textContent : '').trim();
        if (!t || t.length < 20) continue;
        const r = el.getBoundingClientRect();
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0' ||
            parseFloat(st.fontSize) < 2 || r.width < 2 || r.height < 2 || st.color === st.backgroundColor)
          out.push(t.slice(0, 400));
      }
      return out;
    }""")
    res = {"url": page.url, "title": page.title(), "elements": els,
           "text": text[:12000], "hidden_text": hidden}
    if with_shot:
        res["screenshot"] = base64.b64encode(page.screenshot(type="jpeg", quality=55)).decode()
    return res


if __name__ == "__main__":
    main()
