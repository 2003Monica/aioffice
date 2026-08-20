# AI Office

A pixel-art dashboard depicting six AI agents ("desks") working in a virtual
office: backend, research, frontend, debugger, security, sql. An "assistant"
character walks between desks to dispatch and collect task results.

## Structure

- **Frontend** (`src/`): React/Vite, built and maintained in
  [Lovable](https://lovable.dev). Do not restructure it — layout, routing,
  and build config (`vite.config.ts`) are managed by the Lovable toolchain.
  Commits pushed to the connected branch sync back into the Lovable editor
  (see `AGENTS.md`).
- **Backend** (`backend/`): FastAPI app implementing the exact contract
  defined in [src/lib/office-api.ts](src/lib/office-api.ts) — `GET /status`,
  `POST /task`, `POST /desk/{desk_id}/provider`, `POST /assistant/clear`.
  The frontend falls back to an in-memory mock when `VITE_OFFICE_API_URL` is
  unset, so the real backend must match that mock's behavior and shapes
  exactly (desk ids/keywords, status/assistant-state transitions, etc).

## Current state

Three desks make real streaming calls to a hosted LLM; each independently
falls back to the same simulated staged output if its API call fails
(missing/bad key, rate limit, network error), so a desk always completes
and one provider being down never affects the others. See
`backend/agents.py` (`DESK_HANDLERS`, `_run_live`).

- **Backend** → NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`,
  via the OpenAI-compatible `https://integrate.api.nvidia.com/v1`
  endpoint). Requires `NVIDIA_API_KEY`.
- **Research** → Groq, GPT-OSS 20B, medium reasoning (`openai/gpt-oss-20b`,
  `reasoning_effort="medium"`, via `https://api.groq.com/openai/v1`) — fast
  model for quick lookups/comparisons. Requires `GROQ_API_KEY`.
- **Debugger** → Groq, GPT-OSS 120B, high reasoning (`openai/gpt-oss-120b`,
  `reasoning_effort="high"`, same Groq endpoint) — larger model for
  root-causing crashes/stack traces. Also requires `GROQ_API_KEY` (same key
  as Research).
- **Frontend, Security, SQL/Database** return **artifacts only** (simulated
  staged output lines) — there is no live command execution or real model
  call for them yet.

Both keys (`NVIDIA_API_KEY`, `GROQ_API_KEY`) go in `backend/.env` (copy
`backend/.env.example`, which is checked in as a template; `.env` itself is
gitignored and never committed).

Wiring real providers into the remaining three desks is a **future step**.
`backend/agents.py` is structured so a provider handler can be swapped in
later (either branch on `desk_id` the way the three live desks do, or
register one in `PROVIDER_HANDLERS`) without changing the endpoint contract
in `backend/main.py`.
