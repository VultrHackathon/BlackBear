"""Manual smoke test: start one store sandbox, load the page, try forbidden egress."""
import asyncio, sys
from backend import dispatcher

async def main(store):
    async def on_proxy(s, ev):
        if ev["ev"] == "block": print("  PROXY BLOCK", ev["host"], "-", ev["reason"])
    async with dispatcher.Sandbox(store, on_proxy) as sb:
        print("goto", await sb.cmd(cmd="goto", url="https://www.apotekhjartat.se/"))
        o = await sb.cmd(cmd="observe")
        print("title:", o.get("title"), "| elements:", len(o.get("elements", [])), "| shot bytes:", len(o.get("screenshot", "")))
        for u in ["https://example.com/", "http://169.254.169.254/latest/meta-data/", "http://10.10.0.3:8000/"]:
            print("goto", u, "->", (await sb.cmd(cmd="goto", url=u)).get("error", "LOADED?!")[:90])
        await asyncio.sleep(1)
    print("destroyed")

asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "apotekhjartat"))
