# Office collaboration

Normal orders now produce one coordinated report. Private meetings continue to
call exactly the chosen desk and never start the coordinator.

## Planning and selection

`orchestrator.py` creates an explicit plan before starting any model call. The
lightweight planner is deterministic: whole-word capability matching plus
rules for dependencies and review. Its vocabulary and assignment templates live
in `shared/office-workflow.json`, also used by the frontend demo. It is not an
LLM planner; uncommon or ambiguous requests may need more explicit wording.
Unknown topics go to Research for model-based reasoning, not random desks.

The old three-desk cap has been replaced by a relevant subset of up to six.
Examples:

| Order | Plan |
| --- | --- |
| Style this CSS button | Frontend |
| Optimize this PostgreSQL query | SQL → Debugger |
| Build a responsive dashboard connected to our FastAPI API | Backend → Frontend → Debugger |
| Research approaches for storing embeddings securely | Research → SQL → Security |
| Design a secure React/FastAPI login system backed by PostgreSQL | SQL → Backend → Frontend → Security → Debugger |

Research runs first when selected. Backend receives SQL's schema when available;
Frontend receives Backend's contract. Security reviews prior work and Debugger
checks integration after technical contributions (including the security review).
Independent assignments are still executed sequentially to avoid competing for
the local Ollama model. Each receives its own subtask, the unchanged original
request, and only prerequisite results. Project details must be supplied in the
original request; agents cannot inspect repository files or browse.

## Workspace and handoffs

`TaskWorkspace` contains a unique ID, original request, plan, final owner, latest
and initial contributions with provider metadata, timestamped structured messages,
warnings, state, and final report. Everything is in process memory. The last 20
orders are retained; restarting the backend clears them. Use one Uvicorn worker.

An assignment starts only after its prerequisites have produced results. Handoff
entries include sender, recipient, kind, timestamp and a short result excerpt.
Each prerequisite's prompt context is capped at 4,000 characters, with truncation
marked. Stored model results are capped at 16,000 characters. A simulated or
unavailable contribution is explicitly labelled so downstream work can state
its limitations instead of treating it as evidence.

## Reviews, revisions and limits

Reviewers are asked for JSON containing a readable `summary` and zero or one
`revision_requests` entry with an assigned specialist target and a concrete issue.
Targets must be prerequisite specialists. Unknown desks, reviewer-to-reviewer
requests, and multiple requests from one reviewer are rejected. Malformed review
output is retained visibly, with a warning; it cannot schedule more calls.

All reviews finish before one revision round. Corrections addressed to the same
specialist are combined into one call. Each revised contribution replaces that
specialist's latest result; the original remains available. If revision generation
fails, the original is kept and the unresolved correction is flagged. Reviews are
not rerun after revisions: final synthesis explicitly checks changes against
review findings and identifies remaining contradictions.

Hard limits:

- Six participating desks and six levels in the initial dependency graph.
- One initial call per selected desk, including at most two reviewer calls.
- At most one correction request per reviewer, one revision per target, and
  one revision round (at most two revision calls total).
- At most one synthesis call: at most nine agent-runner calls per order.
- A 20-minute whole-order deadline; existing provider timeouts still apply.
- One active office order; another POST receives HTTP 409 instead of overwriting
  shared desks. The UI disables dispatch until the current order ends.
- No recursive model calls, tool use, execution, scans, SQL writes or file access.

Timeouts/cancellation stop remaining work, release desks and preserve a partial
report. Unexpected per-agent failures become unavailable contributions; other
assignments continue. Provider fallback is unchanged:

- Backend: NVIDIA Nemotron → Ollama → simulation.
- Research / Debugger: their existing Groq models → Ollama → simulation.
- Frontend / Security / SQL: Ollama → simulation.

## Final report and UI

The planner selects a final owner: Research for investigation, Frontend for UI
work, otherwise the most relevant implementation specialist (usually Backend
for cross-functional software). Single-desk orders reuse their answer without
another model call. Multi-desk orders use one final editor call through the same
owner's provider chain, with all latest contributions and review corrections.
The editor is instructed to reconcile contracts and produce one coherent answer.
If synthesis is unavailable, a clearly labelled compilation preserves useful
work. When every contribution is unavailable/simulated, synthesis is skipped.

`POST /task` and `GET /status` retain desks and assistant and add `tasks`.
Desk status adds `waiting`, `reviewing`, `revising`, `synthesizing`; `current_task`
now describes the assignment, with `activity` and `task_id` alongside it.
No new endpoint or dependency is required.

The existing 1.5-second polling drives the pixel office. Waiting agents remain
at their desk; active/review/revision states reuse working animations. Cards and
desk details show the assignment and actual workflow activity. Office Orders
has one history item per workspace ID, an expandable assignment/activity feed,
warnings, and the final report. Previous reports are not overwritten by a new
order using the same desks. Coffee, banter, minimap, courier and private meetings
remain part of the existing scene system.

Demo mode runs bounded timed assignments, handoffs, illustrative reviews and
revisions through the same API shape. Every demo finding is explicitly simulated.
It never calls Ollama or FastAPI.

## Run and manually verify

From the repository root, start the backend:

```powershell
./backend/.venv.local/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload --port 8000
```

In another terminal:

```powershell
$env:VITE_OFFICE_API_URL = "http://localhost:8000"
npm.cmd run dev
```

Keep `shared/office-workflow.json` alongside the backend's parent directory when
copying this prototype. Ollama defaults remain `http://localhost:11434` and
`gpt-oss:20b`; NVIDIA/Groq use the existing keys in `backend/.env`.

1. Submit `Style this CSS button`. Only Frontend should participate and produce
   one report without a separate synthesis call.
2. Submit `Design a secure React/FastAPI login system backed by PostgreSQL.`
   Open Assignments & handoffs. Expect SQL, Backend, Frontend, Security, Debugger.
   Watch waiting → working → review, and SQL → Backend → Frontend handoffs.
3. To exercise integration review, include contradictory sample contracts:
   `The existing API returns access_token but the React client reads response.token.
   Preserve these supplied observations in your analysis and identify necessary fixes.`
   Inspect Debugger's findings; a valid concrete revision request causes one
   correction call to its target. A model may instead resolve the mismatch during
   the initial contribution; revisions are conditional, not forced in live mode.
4. Wait for FINAL OFFICE REPORT. Check that it combines schema, API, UI and review
   findings, and that the overall task appears only once in history.
5. Run the PostgreSQL and embeddings examples above to confirm focused subsets.
6. Attempt a second order while the first runs: the UI disables dispatch; a direct
   second POST returns 409. After completion, a new order retains the old report.
7. Use temporary invalid NVIDIA/Groq keys in a test backend terminal to observe
   Ollama fallback. To test total provider failure, also set
   `$env:OLLAMA_BASE_URL='http://127.0.0.1:11435'` and restart. Expect a partial,
   labelled report and usable status API. Restore overrides afterwards.
8. Open a Security private meeting and ask about React/FastAPI/SQL. Only Security
   should respond; no office task or collaboration plan should be created.
9. For demo mode, remove `VITE_OFFICE_API_URL` and restart Vite. Repeat the login
   example; the activity feed includes labelled demo revisions and a demo report.
10. Check scene movement, coffee, banter, minimap and closing a private meeting.
    Browser visual verification requires a connected browser; automated tests
    below validate the data/state workflow rather than pixel rendering.

## Automated verification

```powershell
./backend/.venv.local/Scripts/python.exe -m unittest discover -s backend -v
node --test tests/office-collaboration.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run build
```

Backend tests cover selection, distinct prompts, topological order, relevant
context, review validation, revision limits, latest-result synthesis, provider
failure isolation, timeout/cancellation, bounded history, conflicting submissions
and private-meeting isolation. Demo tests execute the actual frontend API with
an advanced clock to check handoffs, reviews/revisions, termination, history and
private meetings. TypeScript, targeted ESLint and production build are also checked.

Verified for this implementation: 22 backend tests and two demo API tests pass;
TypeScript, ESLint on changed frontend files, and the production build pass.
A live local run with hosted keys deliberately absent completed Backend →
Frontend → Debugger, accepted one Debugger correction addressed to Backend,
ran that revision once, and finished Frontend synthesis with status `done`,
all contributions from Ollama, and no workflow warnings. The diagnostic script's
final console print encountered Windows encoding limitations after completion;
the report's full text was not visually inspected. Browser visual QA was not
available because no browser was connected.

## File inventory

Added:

- `backend/orchestrator.py`: planner, workspace, review parsing and coordinator.
- `backend/test_orchestrator.py`: collaboration behavior tests.
- `shared/office-workflow.json`: shared capability vocabulary and assignments.
- `src/lib/office-collaboration.ts`: types, state helpers and demo planner.
- `src/components/office/CollaborationPanel.tsx`: assignments, feed and report.
- `tests/office-collaboration.test.mjs`: actual demo API tests.
- `backend/COLLABORATION.md`: this implementation and verification guide.

Modified:

- `backend/main.py`: start coordinator, expose workspaces, protect active order.
- `backend/agents.py`: final-editor system instructions; provider chain unchanged.
- `backend/test_ollama.py`: adapt task tests to orchestration; retain provider tests.
- `src/lib/office-api.ts`: workspace contract and collaborative demo runner.
- `src/hooks/useOfficeScene.ts`: task-ID history and workflow-driven animations.
- `src/lib/office-scene.ts`: assignment/activity and workspace history fields.
- `src/components/office/AgentCards.tsx`: assignment and workflow badges.
- `src/components/office/DeskDialog.tsx`: workflow status labels/colors.
- `src/components/office/ChatPanel.tsx`: collaboration panels and dispatch state.
- `src/routes/index.tsx`: wire task controls and updated description.
- `tsconfig.json`: shared JSON imports.
- `backend/README.md`: point to collaboration behavior instead of legacy cap.
