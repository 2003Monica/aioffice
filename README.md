# AI Office
An isometric dashboard for coordinating six specialist AI desks: Backend, Research, Frontend, Debugger, Security and SQL/Database.

## Case study
AI Office explores how to make a multi-agent text workflow understandable: show who is working, what each specialist receives, how results move between desks, and which provider actually answered. Built on a Lovable-generated frontend, it combines a pixel-art office with a Python coordinator, hosted models and local inference.

**Status:** local development/portfolio prototype. Agents generate text and suggested code only; they cannot browse, inspect repositories, execute commands, edit files, scan systems or run SQL.

## Architecture
- **UI:** React 19, TypeScript, TanStack Start/Router, Vite, Tailwind CSS and Radix/shadcn components. [Office scene](src/hooks/useOfficeScene.ts) connects API state to desk animations, cards, dialogs and output.
- **API:** [FastAPI](backend/main.py) accepts orders through `POST /task` and exposes workspaces through `GET /status`. A background asyncio coordinator keeps requests responsive; the browser polls every 1.5 seconds.
- **Coordination:** [orchestrator.py](backend/orchestrator.py) uses capability rules from [shared/office-workflow.json](shared/office-workflow.json). State and the last 20 orders live in process memory.
- **Model access:** [agents.py](backend/agents.py) shares provider handling across office orders and direct meetings. Credentials remain in backend environment variables.
- **Demo boundary:** without `VITE_OFFICE_API_URL`, [office-api.ts](src/lib/office-api.ts) runs an explicitly simulated local workflow without FastAPI or model calls.

## Providers and fallback
| Desk | Attempt order |
| --- | --- |
| Backend | NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`) → Ollama → simulation |
| Research | Groq GPT-OSS 20B, medium reasoning → Ollama → simulation |
| Debugger | Groq GPT-OSS 120B, high reasoning → Ollama → simulation |
| Frontend, Security, SQL | Ollama → simulation |

Ollama defaults to `gpt-oss:20b`. Missing keys, HTTP errors, timeouts and malformed/empty responses advance the chain while preserving the prompt and desk role. Provider/model metadata and fallback markers distinguish generated answers from simulation. The legacy Provider A/B/C selector is placeholder metadata; it does not change these chains.

Hosted responses stream into backend output; Ollama returns a complete answer with `stream: false`. Browser updates use polling rather than token streaming. Cloud calls have a 90-second deadline; Ollama has a 10-second connection timeout and 300-second overall deadline. Failed partial cloud output can remain in the terminal before a fallback marker.

## Collaborative workflow
1. A deterministic keyword/capability planner selects up to six relevant desks. It is not an LLM planner; unfamiliar requests default to Research.
2. Specialists run **sequentially in dependency order**, including independent assignments, to avoid competing for the local model. Each receives its subtask, the original request and bounded prerequisite results.
3. Security and Debugger can review earlier contributions. Validated structured review requests allow one bounded revision round.
4. A final owner synthesizes the latest contributions into one report. Single-desk orders reuse their answer; failed synthesis preserves a labelled compilation.

For example, a secure React/FastAPI login request backed by PostgreSQL selects SQL → Backend → Frontend → Security → Debugger.

The coordinator allows one active office order (conflicts return HTTP 409), at most nine agent-runner calls and a 20-minute order deadline. Those calls may each try multiple providers. Warnings and partial reports expose unavailable contributions. See [collaboration design and checks](backend/COLLABORATION.md).

## UI decisions and challenges solved
- **Visible coordination:** a CSS isometric office, courier, desk cards, right-docked Office Orders panel and persistent Live Output terminal connect activity to results. Coffee-room movement and banter provide idle animation.
- **Direct meetings:** a separate dialog calls only the selected desk through `POST /agents/{id}/message`, leaving normal task outputs/history untouched. Conversation history is temporary and bounded; closing aborts the browser request, although server generation may finish. “Private” describes this UI scope, not an authenticated privacy boundary.
- **Layout overflow:** the [August 20 fix](https://github.com/2003Monica/aioffice/commit/84b7593851dde3b072488a15f6a0dc2d78e5ccff) added `min-w-0` so scrolling cards could shrink without pushing chat off-screen, plus wrapping for long order text.
- **Scene fitting:** the same fix compressed the projected X axis and measured the union of descendant bounds, accounting for walls and props outside the nominal scene box.
- **Provider/workflow failures:** asynchronous calls, deadlines, bounded review parsing and per-agent failure isolation keep status available and preserve partial work.

## Run locally
**UI demo:** install Node.js/npm, then:
```sh
git clone https://github.com/2003Monica/aioffice.git
cd aioffice
npm install
npm run dev
```
Open the URL printed by Vite. Leave `VITE_OFFICE_API_URL` unset for simulated mode.

**Model-backed mode:** follow the [backend setup guide](backend/README.md) for Python 3.11+, an isolated environment, dependencies and Ollama. Copy `backend/.env.example` to `backend/.env`; configure NVIDIA/Groq keys for hosted models and pull the local Ollama model. Keep secrets out of Git.

Start FastAPI from the repository root with one worker:
```sh
python -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```
In a separate frontend terminal, set `VITE_OFFICE_API_URL=http://localhost:8000` using your shell's environment syntax, then run `npm run dev`. Restart Vite after changing it. Ollama must be reachable from the FastAPI host; retain the `shared/` directory alongside `backend/`.

## Verification and next steps
Regression commands from the repository root (with dependencies installed):
```sh
python -m unittest discover -s backend -v
node --test tests/office-collaboration.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```
The [collaboration guide](backend/COLLABORATION.md) records 22 backend tests, two demo API tests, TypeScript/targeted lint/build checks and a live Ollama collaboration run. These are recorded implementation results, not a guarantee for every environment. The backend guide notes that live NVIDIA/Groq success was not tested; browser visual QA was unavailable.

**Implemented:** dependency-aware text collaboration, bounded reviews/revisions, final reports, provider fallback, simulated demo mode and direct agent conversations.

**Future improvements:** persistent storage, authentication and user isolation, deployment hardening, broader browser/accessibility tests, live hosted-provider verification and more flexible planning. The current single-process, in-memory API has no authentication layer and is not production-ready. Model suggestions and reviews require human validation.

## Resume-ready summary
> AI Office — React/TypeScript and FastAPI portfolio prototype demonstrating six specialist AI desks, dependency-aware handoffs, bounded reviews and report synthesis, NVIDIA/Groq integrations with local Ollama fallback, and an isometric dashboard with direct agent conversations. Generates text and suggested code; does not execute tasks.
