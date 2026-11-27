"""BlackBear egress proxy. One per store sandbox.

Only hosts in BB_ALLOW (exact or *.suffix) are reachable. After DNS resolution,
private, loopback, link-local (cloud metadata 169.254.169.254), multicast and
reserved addresses are refused, so DNS tricks cannot reach internal services.
Every decision is logged as a JSON line on stdout for the security scoreboard.
"""
import asyncio
import ipaddress
import json
import os
import socket
import sys
import time

ALLOW = [h.strip().lower() for h in os.environ.get("BB_ALLOW", "").split(",") if h.strip()]
PORT = int(os.environ.get("BB_PORT", "3128"))
seen = set()


def log(ev, host, reason=""):
    key = (ev, host, reason)
    if key in seen and ev == "allow":
        return
    seen.add(key)
    print(json.dumps({"t": time.time(), "ev": ev, "host": host, "reason": reason}), flush=True)


def host_allowed(host):
    host = host.lower().rstrip(".")
    for a in ALLOW:
        if a.startswith("*."):
            if host == a[2:] or host.endswith(a[1:]):
                return True
        elif host == a:
            return True
    return False


def ip_ok(ip):
    a = ipaddress.ip_address(ip)
    return not (a.is_private or a.is_loopback or a.is_link_local or a.is_multicast
                or a.is_reserved or a.is_unspecified)


async def resolve_safe(host, port):
    try:
        ipaddress.ip_address(host)
        return None, "raw IP address"
    except ValueError:
        pass
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except Exception as e:
        return None, f"dns: {e}"
    ips = [i[4][0] for i in infos]
    bad = [ip for ip in ips if not ip_ok(ip)]
    if bad:
        return None, f"resolves to internal address {bad[0]}"
    return ips[0], ""


async def pipe(r, w):
    try:
        while True:
            data = await r.read(65536)
            if not data:
                break
            w.write(data)
            await w.drain()
    except Exception:
        pass
    finally:
        try:
            w.close()
        except Exception:
            pass


async def handle(reader, writer):
    try:
        head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 20)
    except Exception:
        writer.close()
        return
    first = head.split(b"\r\n", 1)[0].decode("latin1")
    parts = first.split(" ")
    if len(parts) < 3:
        writer.close()
        return
    method, target = parts[0], parts[1]
    if method == "CONNECT":
        host, _, port = target.rpartition(":")
        port = int(port or 443)
        rest = b""
    else:
        # plain http: absolute URI
        from urllib.parse import urlsplit
        u = urlsplit(target)
        host, port = u.hostname or "", u.port or 80
        path = (u.path or "/") + (("?" + u.query) if u.query else "")
        rest = head.replace(target.encode(), path.encode(), 1)
    host = host.strip("[]")
    if port not in (80, 443):
        log("block", host, f"port {port}")
        return await deny(writer)
    if not host_allowed(host):
        log("block", host, "not on store allowlist")
        return await deny(writer)
    ip, why = await resolve_safe(host, port)
    if not ip:
        log("error" if why.startswith("dns") else "block", host, why)
        return await deny(writer)
    try:
        ur, uw = await asyncio.wait_for(asyncio.open_connection(ip, port), 15)
    except Exception as e:
        log("error", host, str(e)[:100])
        return await deny(writer, b"502 Bad Gateway")
    log("allow", host)
    if method == "CONNECT":
        writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        await writer.drain()
    else:
        uw.write(rest)
        await uw.drain()
    await asyncio.gather(pipe(reader, uw), pipe(ur, writer))


async def deny(writer, status=b"403 Forbidden"):
    try:
        writer.write(b"HTTP/1.1 " + status + b"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()
    finally:
        writer.close()


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT)
    print(json.dumps({"t": time.time(), "ev": "ready", "allow": ALLOW}), flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
