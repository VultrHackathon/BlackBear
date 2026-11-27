import os
from pathlib import Path


def _load_env():
    for p in (Path(__file__).resolve().parent.parent / ".env", Path("/opt/app/.env")):
        if p.exists():
            for line in p.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
            break


_load_env()

INFERENCE_BASE_URL = os.environ.get("VULTR_INFERENCE_BASE_URL", "https://api.vultrinference.com/v1")
INFERENCE_API_KEY = os.environ.get("VULTR_INFERENCE_API_KEY", "")

# Large model: planner, promo parser, compare. Fast model: scouts. Both must read images.
PLANNER_MODEL = os.environ.get("PLANNER_MODEL", os.environ.get("AGENT_MODEL", "glm-5.3"))
SCOUT_MODEL = os.environ.get("SCOUT_MODEL", "glm-5.3-flash")
COMPARE_MODEL = os.environ.get("COMPARE_MODEL", PLANNER_MODEL)
SAFETY_MODEL = os.environ.get("SAFETY_MODEL", "nemotron-3.5-content-safety")

SANDBOX_CONTEXT = os.environ.get("SANDBOX_DOCKER_CONTEXT", "sandbox")
SANDBOX_RUNTIME = os.environ.get("SANDBOX_RUNTIME", "runsc")
BROWSER_IMAGE = os.environ.get("BROWSER_IMAGE", "blackbear/browser:latest")
PROXY_IMAGE = os.environ.get("PROXY_IMAGE", "blackbear/proxy:latest")
SANDBOX_MEMORY = os.environ.get("SANDBOX_MEMORY", "1536m")
SANDBOX_CPUS = os.environ.get("SANDBOX_CPUS", "1.5")
SANDBOX_TIMEOUT_S = int(os.environ.get("SANDBOX_TIMEOUT_S", "240"))
SCOUT_MAX_STEPS = int(os.environ.get("SCOUT_MAX_STEPS", "22"))

DATA_DIR = Path(os.environ.get("BB_DATA_DIR", "/opt/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
