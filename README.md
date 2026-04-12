# Hermes-Agent: Industrial-Grade Web UI for High-Performance LLM Orchestration

> **A production-oriented reference UI for [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)** — built for teams who ship **hermes-agent** in production and refuse to trade off **latency**, **security**, or **delivery velocity**. *Scope labels below separate **shipped** behavior from **preview / stub** surfaces so expectations stay honest on GitHub.*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Build](https://img.shields.io/badge/build-GitHub%20Actions-lightgrey.svg)](#reliability--ci-evidence)
[![Coverage](https://img.shields.io/badge/coverage-pytest%20%2B%20e2e-lightgrey.svg)](apps/api/tests)
[![Performance](https://img.shields.io/badge/performance-60FPS%20class-green.svg)](#performance--compliance)

**Languages:** **English** is the canonical README (SSOT). **Full Simplified Chinese mirror:** [README.zh-CN.md](README.zh-CN.md) · [Chinese mirror (summary)](#chinese-mirror)

**Why this exists — in four lines**

- **60FPS-class UX** — long reasoning traces stay smooth via buffered rendering and **virtualized lists** once the trace exceeds **500 lines**.
- **Zero-trust multi-tenant isolation** — **JWT scoped access**, **session→user ownership** binding, and **sandboxed HTML artifacts** are first-class, not bolt-ons.
- **Product-grade shell** — multi-area **App Shell** (Chat, Insights, Skills, Orchestration), **IndexedDB** chat sessions, and **interactive `clarify`** over a **single long-lived WebSocket** (`clarify_pick`), aligned with upstream tool contracts.
- **One-click deploy** — **Docker Compose** profiles separate **Demo** (time-to-wow) from **Prod** (**secure by default**: non-root, internal data plane, health-gated startup).

## Preview

![ScreenShot_2026-04-12_161956_276](F:\desktop\hermes-agent-ui\assets\ScreenShot_2026-04-12_161956_276.png)

---

## Table of contents

- [Why Hermes-Agent UI](#why-hermes-agent-ui)
- [Feature readiness (shipped vs preview)](#feature-readiness-shipped-vs-preview)
- [3-minute quickstart](#3-minute-quickstart)
- [Performance & compliance](#performance--compliance)
- [Architecture](#architecture)
- [Scope matrix (A2)](#scope-matrix-a2)
- [Deployment guide — production & secure-by-default](#deployment-guide--production--secure-by-default)
- [Developer reference](#developer-reference)
- [Reliability & CI evidence](#reliability--ci-evidence)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Chinese mirror](#chinese-mirror) · [README.zh-CN.md](README.zh-CN.md)

---

## Why Hermes-Agent UI

### High-performance virtualization (500+ reasoning steps)

Agent UIs usually die by a thousand small re-renders. Hermes-Agent UI treats the **Reasoning Trace** as a **stream**, not a naive React list:

- **Inbound frame batching** coalesces bursty WebSocket traffic before paint.
- **`requestAnimationFrame`-aligned flushes** keep the main thread responsive under load.
- **Windowed rendering** activates automatically when trace lines exceed **500**, so **O(n) DOM** never scales with step count.

The result: the interface stays **interactive** while the model keeps thinking.

### Zero-trust multi-tenant security

- **JWT on the WebSocket first packet** and **`Authorization: Bearer`** for HTTP — one shared `get_current_user` dependency, no duplicated auth logic.
- **`session_id` → `user_id` ownership** in SQLite (`session_owners`) — replay and persistence are **owner-scoped**.
- **Scoped capabilities** (`admin:stats:read`, `benchmark:run`) enforced with **`require_scope()`** — least privilege by default.
- **HTML artifacts** carry a **zero-privilege policy**; the UI only renders HTML inside a **sandboxed iframe** when the contract is satisfied. Server-side hardening blocks dangerous tags and oversized payloads.

### Industrial-grade session resilience

- **Structured frames** (`THOUGHT`, `TOOL_CALL`, `ARTIFACT`, `RESPONSE`, `STATUS`, `ERROR`, …) with monotonic **`seq`**.
- **Server-side replay persistence** (SQLite) + client **`resume_from_seq`** — reconnect without losing narrative continuity.
- **Heartbeats + exponential backoff reconnect** on the client — the chat stays usable on flaky networks.
- **Browser session store (IndexedDB)** — multiple conversations, titles, and hydrated transcripts per **`session_id`** (client-side UX; server replay remains owner-scoped).

### Product shell, sidecar APIs & interactive `clarify`

- **App Shell** (Next.js App Router): sidebar navigation across **Chat**, **Insights**, **Skills**, and **Orchestration**. **Chat** is the production-critical path; **Orchestration** is **preview/mock** and **Skills sandbox run** is a **stub** — see [Feature readiness](#feature-readiness-shipped-vs-preview).
- **Sidecar HTTP APIs** — FastAPI routers under `apps/api/routers/` (insights, skills catalog/install, orchestration, etc.) with optional **SQLite-backed** helpers where documented in code.
- **`clarify` tool (upstream contract)** — when the model calls `clarify`, the API **blocks** the Hermes callback until the user submits a choice via **`clarify_pick`** on the **same** `/ws/agent` connection (background reader + merged wait so picks are not starved). The UI may show **`STATUS`** with **`waiting_clarify`**. Optional **`HERMES_CLARIFY_TIMEOUT_SEC`** (default `3600`; `≤0` means wait indefinitely).
- **`packages/skill-spec`** — JSON Schema + docs for `skill.json`-style packages consumed by the Skills UI and validation helpers.

---

## Feature readiness (shipped vs preview)

Use this table when triaging issues or planning forks. **“Preview”** means UI/API exists but is not a full standalone product in that domain.

| Surface | Status | Notes |
| --- | --- | --- |
| **Chat** — WebSocket streaming, replay, `clarify` + `clarify_pick`, artifacts, sandboxed HTML | **Shipped** | Primary production path; aligns with upstream **hermes-agent** tool contracts. |
| **IndexedDB** chat sessions | **Dev** | Client-side multi-session history; server replay remains owner-scoped. |
| **Insights** hub | **Dev** | REST APIs wired (`/insights/...`); charts populate as the agent runs (sparse until used). |
| **Skills** hub — catalog, install, JSON Schema validation | **Dev** | End-to-end against API. |
| **Skills** — editor / “Run in sandbox” | **Dev** | Placeholder execution only — **no** real isolation; see in-app copy. |
| **Orchestration** hub — task graph, Time Travel, fork | **Preview** | **Mock / heuristic** snapshots for UX demos — **not** a full distributed orchestration engine. |

---

## 3-minute quickstart

> **Goal:** from a clean clone, reach a **working Chat** (health checks green, LLM configured) and send one message that streams **Reasoning Trace + Artifacts** — about three minutes after images are built.

### Prerequisites

- **Docker Desktop** (or Docker Engine) + **Docker Compose v2**
- **Git**
- A valid **OpenAI-compatible API key** (OpenAI, Azure OpenAI, DashScope-compatible, etc.) — the API container loads **`apps/api/.env`**; without real keys the agent may not call your provider as intended.

### Option A — Docker Compose `demo` profile (recommended first run)

Run from the **repository root** (clone URL = this GitHub repository):

```bash
git clone <repository-url>
cd hermes-agent-ui

# 1) Compose + build args (mirrors, profiles)
cp .env.example.docker .env

# 2) API runtime — REQUIRED for real LLM calls (Compose mounts this file)
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env: set OPENAI_API_KEY (and OPENAI_BASE_URL if you use Qwen/DashScope/etc.)
# Keep HERMES_PROVIDER/HERMES_MODEL consistent with your provider.

# 3) Build and start (api-demo + web-demo; auth off for demo)
docker compose --profile demo up --build
```

Wait until **`hermes-api-demo`** is **healthy** (Compose shows `healthy`), then:

1. **Smoke test API:** open **`http://localhost:8000/health`** — expect JSON `{"ok": true}`.
2. **Open UI:** **`http://localhost:3000`** — sidebar **Chat** is the main experience.
3. Under the composer, click a **Demo Templates** chip **or** type a short prompt and send — **Reasoning Trace** and **Artifacts** should update live.

**Ports (demo)**

| Surface | URL |
| --- | --- |
| Web UI | `http://localhost:3000` |
| API health | `http://localhost:8000/health` |
| Agent WebSocket (browser connects here) | `ws://localhost:8000/ws/agent` |

**Hub routes:** **Insights / Skills / Orchestration** are navigable; Orchestration uses **demo/mock graph** semantics (see [feature readiness](#feature-readiness-shipped-vs-preview)).

**Troubleshooting (demo)**

- **Web never becomes ready:** wait until `api-demo` is **healthy** (`docker compose ps`); inspect **`docker compose logs api-demo`**.
- **Chat hangs or no model output:** confirm **`apps/api/.env`** exists, contains a valid **`OPENAI_API_KEY`**, and **`HERMES_MODEL`** matches your provider; watch API logs for 401/404 from the LLM endpoint.
- **Port already in use:** stop other services on **3000** / **8000** or change host port mappings in `docker-compose.yml`.

### Option B — Local dev without Docker (two terminals)

Useful for UI/API iteration without rebuilding images.

**Terminal 1 — API**

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
# Edit .env: OPENAI_API_KEY, optional OPENAI_BASE_URL, HERMES_MODEL, etc.
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Web (from repo root)**

```bash
pnpm install
pnpm dev:web
```

Ensure **`NEXT_PUBLIC_AGENT_WS_URL`** (and optionally **`NEXT_PUBLIC_AGENT_HTTP_URL`**) point at your API — default is `ws://localhost:8000/ws/agent` and `http://localhost:8000`. Open **`http://localhost:3000`** (Next dev port if shown in the terminal).

### Option C — Production mode (secure by default)

> Use this when you are shipping to **DevOps / SRE** audiences: **JWT on**, **Postgres + Redis** on an **internal Docker network**, **API/Web** still exposed only where you intend.

```bash
cp .env.example.docker .env
# Edit .env: set COMPOSE_PROFILES=prod, real secrets, NEXT_PUBLIC_AGENT_AUTH_TOKEN, OPENAI_API_KEY, etc.
# Optional (CN): set NODE_IMAGE/PYTHON_IMAGE in .env to domestic mirror tags
docker compose --profile prod up --build
```

**Prod checklist (minimum)**

- Set **`HERMES_UI_JWT_SECRET`** to a strong random value.
- Set **`NEXT_PUBLIC_AGENT_AUTH_TOKEN`** at **image build time** (Next.js embeds public env vars).
- Set **`POSTGRES_PASSWORD`**, **`DATABASE_URL`**, **`REDIS_URL`** to non-default values.

---

## Performance & compliance

### Data-driven benchmarks (reference architecture)

Numbers below reflect **typical behavior** on a modern laptop (Chrome, virtualization enabled, Diagnostics panel sampling). **Your hardware will vary** — reproduce with `pnpm perf:baseline` and the in-app **Diagnostics** drawer.

| Metric | Target / typical | Notes |
| --- | --- | --- |
| **Avg FPS** (UI thread, 60s window) | **59+** | With virtualization path active for long traces |
| **Jank index** (dropped frame proxy) | **Low** | `dropped_frames` / `dropped_avg_60s` in Diagnostics |
| **P95 frame parse latency** (client) | **< 4 ms** | Dominated by `JSON.parse` + batching, not layout thrash |
| **Long-session memory** (browser tab) | **< 200 MB** | With trace windowing + capped client frame retention |
| **Synthetic throughput** | **45+ FPS-equivalent** | `pnpm perf:baseline` gate (`HERMES_BENCH_MIN_FPS_EQ`, default `45`) |

> **Honest engineering note:** treat this table as a **contract with your CI**, not a marketing guarantee. The repo ships **automated gates** and **artifact reports** so performance regressions are **diff-visible**.

### Security checklist (what we enforce in code & Compose)

| Control | Status |
| --- | --- |
| **Non-root** API & Web container users | Yes (`docker/api.Dockerfile`, `docker/web.Dockerfile`) |
| **Internal backend network** for Postgres & Redis | Yes (`networks.backend.internal: true` in `docker-compose.yml`) |
| **JWT scoped access** + explicit `require_scope()` | Yes (`apps/api/auth_dependency.py`, `apps/api/main.py`) |
| **Session owner binding** | Yes (`session_owners` + WS gate before replay) |
| **Unauthenticated metadata leakage** on `/replay/stats` | Blocked (401 when auth enabled) |
| **Log rotation** (disk exhaustion guard) | Yes (`json-file`, `max-size` / `max-file` in Compose) |
| **HTML artifact sandbox contract** | Yes (server policy + client iframe rules) |

---

## Architecture

```mermaid
flowchart LR
  subgraph Public["Public ingress"]
    U[Browser / Next.js UI]
  end

  subgraph Edge["Application tier"]
    W[Next.js server]
    A[FastAPI + WebSocket]
  end

  subgraph Data["Data plane (prod profile)"]
    P[(Postgres)]
    R[(Redis)]
  end

  subgraph Agent["Hermes Agent runtime"]
    H[hermes-agent / AIAgent]
  end

  U -->|HTTPS pages| W
  U <-->|"WS + JWT (first packet)"| A
  W -->|optional same-origin proxy| A
  A -->|optional| H
  A -->|internal network only| P
  A -->|internal network only| R
```

**Frame flow (simplified)**

1. Client opens **`/ws/agent`** (long-lived); sends **`WsRequest`** with **`auth_token`**, **`session_id`**, **`message`**, optional **`history`**, **`resume_from_seq`**, and (for clarify resolution) **`clarify_pick`**.
2. Server **authenticates before replay**; binds **`session_id`** to **`user_id`**; streams structured frames; **persists** eligible frames for replay.
3. While the agent turn is streaming, the server **merges** inbound messages so **`clarify_pick`** can unblock the Hermes **`clarify`** callback without closing the socket.
4. UI **batches** incoming frames and **virtualizes** long traces; **Artifacts** render under **security policy**.

---

## Scope matrix (A2)

| Capability | Required scope | Typical user | Admin |
| --- | --- | --- | --- |
| `GET /replay/stats` (self-scoped) | Authenticated | Allowed | Allowed |
| `GET /replay/stats` (global) | `admin:stats:read` | Denied | Allowed |
| WS `/benchmark` stress stream | `benchmark:run` | Denied | Allowed if granted |
| Regular chat / reasoning / artifacts | Authenticated | Allowed | Allowed |

Unauthenticated callers **must not** receive replay metadata (`/replay/stats`).

---

## Deployment guide — production & secure-by-default

> **The `prod` Compose profile is designed as secure-by-default for operators:** non-root services, an **internal bridge** for Postgres/Redis, health-gated dependencies, and **bounded container logs**.

**Before you expose this to the internet**

1. **Rotate all secrets** — especially **`HERMES_UI_JWT_SECRET`** and database passwords.
2. **Set `NEXT_PUBLIC_AGENT_AUTH_TOKEN`** at **build** time for the Web image when auth is on.
3. **Prefer RS256 at scale** — HS256 is fine for a single issuer; multi-service verification usually wants asymmetric keys and a JWKS endpoint.
4. **Persist state intentionally** — Postgres and Redis use named volumes in `prod`; map replay SQLite to a volume if you need durable session history across container restarts (today's compose may use ephemeral API paths — **change `HERMES_UI_DB_PATH` + mount a volume** for durability).
5. **Keep the data plane internal** — only **API:8000** and **Web:3000** should be published; Postgres/Redis stay on **`backend`**.
6. **Forward logs** — Compose rotation prevents disk death spirals; ship JSON logs to your aggregator for SRE workflows.

---

## Developer reference

### Repository layout

| Path | Role |
| --- | --- |
| `apps/web` | Next.js 14 (App Router, TS, Tailwind, Zustand, TanStack Query); **App Shell** + hub routes under `src/app/(shell)/` |
| `apps/web/src/lib` | Session manager (IndexedDB), conversation history, clarify extraction helpers |
| `apps/api` | FastAPI + structured Hermes streaming + replay persistence + **`/ws/agent`** clarify merge |
| `apps/api/routers` | Sidecar REST: insights, skills, orchestration (see each module) |
| `packages/config` | Shared UI strings / constants (i18n) |
| `packages/skill-spec` | `skill.json` JSON Schema + spec notes |
| `docker/` | Production-oriented Dockerfiles |
| `scripts/` | `perf-baseline.mjs`, `demo-golden.mjs` |

### Local dev (without Docker)

**Web**

```bash
pnpm install
pnpm dev:web
```

**API**

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Copy `apps/api/.env.example` → `.env` as needed.

### Hermes install source & dependency alignment

- `hermes-agent` is installed from the official GitHub source, not a pinned PyPI version:
  - `hermes-agent @ git+https://github.com/NousResearch/hermes-agent.git`
- Reason: some date-style pins (for example `2026.4.8`) may not exist on public package indexes and can break Docker builds.
- Keep these versions aligned with the current Hermes dependency floor:
  - `python-dotenv==1.2.1`
  - `pydantic==2.12.5`
  - `PyJWT==2.12.0`
- `docker/api.Dockerfile` installs `git` because VCS dependencies require it during `pip install -r requirements.txt`.

### Replay persistence

- Default DB path: `apps/api/runtime.db` (local dev); override with **`HERMES_UI_DB_PATH`**.
- Client sends **`resume_from_seq`**; server replays frames with **`seq > resume_from_seq`**.
- TTL: **`HERMES_UI_REPLAY_RETENTION_HOURS`** (default `24`).
- Cap per replay request: **`HERMES_UI_MAX_REPLAY_FRAMES`** (default `2000`).
- Artifact cap: **`HERMES_UI_MAX_ARTIFACT_CHARS`** (default `20000`, suffix `[TRUNCATED_BY_SERVER]`).

### Clarify & WebSocket fields

- **`WsRequest.clarify_pick`** — user’s selected label/value while the server is blocked inside the Hermes **`clarify`** callback; must use the **same** `session_id` and authenticated principal as the active turn.
- **`HERMES_CLARIFY_TIMEOUT_SEC`** — optional server-side wait bound for the threading queue (default `3600`; `≤0` = wait indefinitely).

### Authentication & session isolation

- WebSocket first packet: **`auth_token`** (JWT, HS256 today).
- Enable with **`HERMES_UI_AUTH_ENABLED=1`** and set **`HERMES_UI_JWT_SECRET`**, issuer, audience.
- **`session_id`** is bound to **`user_id`** in **`session_owners`**; mismatches → **`SESSION_FORBIDDEN`**.

### Prompt modularization

- `apps/api/prompt_service.py` + Jinja2 templates under `apps/api/templates/`.

### Artifact security contract

- Payload includes **`security_policy`** (`zero-privilege` sandbox).
- HTML: server blocks dangerous tags / oversize content; client only iframe-renders when policy matches.

### Performance tooling

- **`pnpm perf:baseline`** — JSON report + optional CI gate (`HERMES_BENCH_*` env vars).
- **`pnpm demo:golden`** — multi-prompt golden path report (`HERMES_DEMO_*`).
- **`/benchmark`** requires **`benchmark:run`** scope when auth is enabled.

---

## Reliability & CI evidence

| Workflow | Purpose |
| --- | --- |
| `.github/workflows/perf-baseline.yml` | Scheduled / manual performance gate + JSON artifacts |
| `.github/workflows/demo-golden.yml` | Golden multi-prompt demo + API log artifact |

**Tests**

- `apps/api/tests/` — unit, auth, scope, **WebSocket e2e resilience** (`test_e2e_ws_resilience.py`), **sidecar API** (`test_sidecar_api.py`).

---

## Roadmap

- Durable replay volume mapping in `prod` as a first-class documented path.
- Optional RS256 / JWKS verification for multi-service deployments.
- Richer Hermes event mapping as upstream APIs evolve.
- Deeper hub integrations (Skills/Orchestration) as product surfaces stabilize.

---

## Contributing

Contributions welcome — please keep changes focused, match existing patterns, and extend tests when touching auth, replay, streaming, or WebSocket clarify flows.

## License

MIT — see `LICENSE` if present, or add one when you publish.

---

## Chinese mirror

**Full Simplified Chinese documentation (structure-aligned with this README):** [README.zh-CN.md](README.zh-CN.md).

Technical detail and API contracts remain **English-first** in source and primary README; the Chinese file is maintained for onboarding teams who prefer 简体中文.
