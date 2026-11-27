"""Vultr Serverless Inference client (OpenAI-compatible) with usage + cost metrics.

Vultr silently serves a default model when the requested id is unknown, so every
reply is checked: the served model must match the requested one.
"""
import asyncio
import json
import re
import time

import httpx

from . import config

_pricing: dict = {}


class ModelMismatch(RuntimeError):
    pass


class Metrics:
    def __init__(self):
        self.calls = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.cost_usd = 0.0
        self.latency_s = 0.0
        self.by_model: dict = {}

    def add(self, model, usage, dt):
        p, c = usage.get("prompt_tokens", 0) or 0, usage.get("completion_tokens", 0) or 0
        price = _pricing.get(model, {})
        cost = p * price.get("prompt", 0) + c * price.get("completion", 0)
        self.calls += 1
        self.prompt_tokens += p
        self.completion_tokens += c
        self.cost_usd += cost
        self.latency_s += dt
        m = self.by_model.setdefault(model, {"calls": 0, "tokens": 0, "cost_usd": 0.0})
        m["calls"] += 1
        m["tokens"] += p + c
        m["cost_usd"] += cost

    def snapshot(self):
        return {"calls": self.calls, "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
                "cost_usd": round(self.cost_usd, 5), "llm_seconds": round(self.latency_s, 1),
                "by_model": {k: {**v, "cost_usd": round(v["cost_usd"], 5)} for k, v in self.by_model.items()}}


_client: httpx.AsyncClient | None = None


def client():
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=config.INFERENCE_BASE_URL, timeout=120,
            headers={"Authorization": f"Bearer {config.INFERENCE_API_KEY}"})
    return _client


async def load_pricing():
    try:
        r = await client().get("/models")
        for m in r.json().get("data", []):
            pr = {}
            for mod in m.get("input_modalities", []):
                for p in mod.get("pricing", []) or []:
                    if p.get("type") == "prompt":
                        pr["prompt"] = float(p["cost_usd"])
            for mod in m.get("output_modalities", []):
                for p in mod.get("pricing", []) or []:
                    if p.get("type") == "completion":
                        pr["completion"] = float(p["cost_usd"])
            _pricing[m["id"]] = pr
    except Exception:
        pass
    return _pricing


async def available_models():
    r = await client().get("/models")
    return [m["id"] for m in r.json().get("data", [])]


async def chat(model, messages, metrics: Metrics | None = None, max_tokens=1500,
               temperature=0.2, json_mode=False, retries=2, extra=None):
    body = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
            **(extra or {})}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    last = None
    for attempt in range(retries + 1):
        t0 = time.time()
        try:
            r = await client().post("/chat/completions", json=body)
            if r.status_code >= 500 or r.status_code == 429:
                raise RuntimeError(f"inference {r.status_code}: {r.text[:200]}")
            if r.status_code >= 400 and json_mode:
                body.pop("response_format", None)  # model may not support JSON mode
                json_mode = False
                raise RuntimeError(f"inference {r.status_code}: {r.text[:200]}")
            r.raise_for_status()
            data = r.json()
            served = data.get("model", model)
            if served.split(":")[0] != model.split(":")[0]:
                raise ModelMismatch(f"asked for {model}, Vultr served {served}")
            if metrics:
                metrics.add(model, data.get("usage", {}), time.time() - t0)
            msg = data["choices"][0]["message"]
            content = (msg.get("content") or "").strip()
            if not content:
                body["max_tokens"] = min(int(body["max_tokens"] * 2), 6000)
                raise RuntimeError(f"empty reply (finish_reason={data['choices'][0].get('finish_reason')})")
            return content
        except ModelMismatch:
            raise
        except Exception as e:
            last = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"LLM call failed: {last}")


def parse_json(text):
    """Pull the first JSON object out of a model reply (tolerates code fences and thinking)."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if m:
        text = m.group(1)
    start = text.find("{")
    if start < 0:
        raise ValueError(f"no JSON in reply: {text[:200]}")
    depth, in_str, esc = 0, False, False
    for i, ch in enumerate(text[start:], start):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError(f"unterminated JSON: {text[:200]}")


async def chat_json(model, messages, metrics=None, max_tokens=1500, **kw):
    """Chat and parse one JSON object from the reply (one repair attempt)."""
    reply = await chat(model, messages, metrics, max_tokens=max_tokens, json_mode=True, **kw)
    try:
        return parse_json(reply)
    except Exception:
        msgs = messages + [{"role": "assistant", "content": reply[:2000]},
                           {"role": "user", "content": "Reply again with ONLY one valid JSON object."}]
        return parse_json(await chat(model, msgs, metrics, max_tokens=max_tokens, **kw))
