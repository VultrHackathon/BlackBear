# BlackBear

Vultr Agent Runtime Hackathon project (Stockholm MLOps #42).

A web-based agent that plans a task, dispatches it to an isolated sandbox on Vultr, and returns verifiable output.

## Architecture (draft)
- **Backend VM (Vultr)**: web app + orchestrator. LLM calls go through Vultr Serverless Inference (`https://api.vultrinference.com/v1`, OpenAI-compatible).
- **Sandbox host VM (Vultr)**: Docker + gVisor (`runsc`). Reached only over a private VPC. Holds no secrets.
- Every run: `--network none`, memory/CPU/PID caps, read-only root, timeout, container destroyed afterwards.

## Configuration
Copy `.env.example` to `.env` and fill in the values. Never commit `.env`.
