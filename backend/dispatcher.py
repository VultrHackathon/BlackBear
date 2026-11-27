"""Dispatcher (step 3): one fresh, throwaway Chromium sandbox per store.

Topology on the sandbox host (reached over the private VPC via Docker context):

    [browser container] --internal net bb-<id>--> [proxy container] --bb-egress--> internet
     gVisor, no secrets,                            allowlist + private-IP block
     no direct route out, mem/cpu/pid caps

Everything is destroyed afterwards (lifecycle discipline).
"""
import asyncio
import json
import uuid

from . import config, stores


async def docker(*args, check=True, timeout=60):
    p = await asyncio.create_subprocess_exec(
        "docker", "--context", config.SANDBOX_CONTEXT, *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(p.communicate(), timeout)
    except asyncio.TimeoutError:
        p.kill()
        raise RuntimeError(f"docker {args[0]} timed out after {timeout}s")
    if check and p.returncode != 0:
        raise RuntimeError(f"docker {args[0]} failed: {err.decode()[:300]}")
    return out.decode().strip()


class Sandbox:
    def __init__(self, store_id, on_proxy_event=None):
        self.store_id = store_id
        self.id = f"bb-{store_id}-{uuid.uuid4().hex[:8]}"
        self.net = self.id
        self.proxy = f"{self.id}-proxy"
        self.browser = f"{self.id}-browser"
        self.proc = None
        self.log_proc = None
        self.on_proxy_event = on_proxy_event
        self._lock = asyncio.Lock()
        self._log_task = None

    async def start(self):
        allow = ",".join(stores.STORES[self.store_id]["allow"])
        await docker("network", "create", "--internal", "--label", "blackbear=1", self.net)
        # The proxy is our own trusted code; it runs on the standard runtime because
        # Docker's embedded DNS does not work inside gVisor. The untrusted browser
        # stays in gVisor and reaches the proxy by IP.
        await docker("run", "-d", "--rm", "--name", self.proxy, "--label", "blackbear=1",
                     "--network", "bb-egress",
                     "--memory", "128m", "--pids-limit", "64", "--read-only", "--cap-drop", "ALL",
                     "-e", f"BB_ALLOW={allow}", config.PROXY_IMAGE)
        await docker("network", "connect", self.net, self.proxy)
        proxy_ip = await docker("inspect", "-f",
                                "{{(index .NetworkSettings.Networks \"%s\").IPAddress}}" % self.net, self.proxy)
        self._log_task = asyncio.create_task(self._follow_proxy())
        self.proc = await asyncio.create_subprocess_exec(
            "docker", "--context", config.SANDBOX_CONTEXT, "run", "-i", "--rm",
            "--name", self.browser, "--label", "blackbear=1",
            "--runtime", config.SANDBOX_RUNTIME, "--network", self.net,
            "--memory", config.SANDBOX_MEMORY, "--memory-swap", config.SANDBOX_MEMORY,
            "--cpus", config.SANDBOX_CPUS, "--pids-limit", "512", "--shm-size", "256m",
            "--read-only", "--tmpfs", "/tmp:size=512m", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--stop-timeout", "2", "-e", f"BB_PROXY=http://{proxy_ip}:3128",
            config.BROWSER_IMAGE,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, limit=32 * 1024 * 1024)
        ready = await self._read(timeout=90)
        if not ready.get("ready"):
            raise RuntimeError(f"browser did not start: {ready}")
        return self

    async def _follow_proxy(self):
        try:
            self.log_proc = await asyncio.create_subprocess_exec(
                "docker", "--context", config.SANDBOX_CONTEXT, "logs", "-f", self.proxy,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            async for line in self.log_proc.stdout:
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if self.on_proxy_event and ev.get("ev") in ("block", "allow", "error"):
                    await self.on_proxy_event(self.store_id, ev)
        except Exception:
            pass

    async def _read(self, timeout=60):
        line = await asyncio.wait_for(self.proc.stdout.readline(), timeout)
        if not line:
            raise RuntimeError("browser sandbox exited")
        return json.loads(line)

    async def cmd(self, timeout=60, **kw):
        async with self._lock:
            self.proc.stdin.write((json.dumps(kw) + "\n").encode())
            await self.proc.stdin.drain()
            return await self._read(timeout)

    async def destroy(self):
        try:
            if self.proc and self.proc.returncode is None:
                try:
                    self.proc.stdin.write(b'{"cmd":"close"}\n')
                    await self.proc.stdin.drain()
                except Exception:
                    pass
        finally:
            await docker("rm", "-f", self.browser, self.proxy, check=False)
            await docker("network", "rm", self.net, check=False)
            for p in (self.proc, self.log_proc):
                if p and p.returncode is None:
                    p.kill()
            if self._log_task:
                self._log_task.cancel()

    async def __aenter__(self):
        try:
            return await self.start()
        except Exception:
            await self.destroy()
            raise

    async def __aexit__(self, *exc):
        await self.destroy()


async def cleanup_orphans():
    ids = await docker("ps", "-aq", "--filter", "label=blackbear=1", check=False)
    if ids:
        await docker("rm", "-f", *ids.split(), check=False)
    nets = await docker("network", "ls", "-q", "--filter", "label=blackbear=1", check=False)
    if nets:
        await docker("network", "rm", *nets.split(), check=False)
