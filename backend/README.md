# AI Office backend

Requires Python 3.11+ and a local Ollama installation. Backend uses NVIDIA,
Research/Debugger use Groq, and Frontend/Security/SQL use Ollama. Every hosted desk falls back to Ollama before simulation. Agents produce
text only: no commands, file edits, scans or SQL execution.

## Run locally (PowerShell)

1. Open Ollama on Windows, or run `ollama serve` in a separate terminal if it
   is not already running. Run `ollama list` and confirm `gpt-oss:20b` appears.
   If it is missing, run `ollama pull gpt-oss:20b`.
   If Ollama is not on PATH, use
   `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" list` (or `serve`).
2. From the repository root, create an isolated Python environment and install:

   ```powershell
   py -m venv backend/.venv.local
   ./backend/.venv.local/Scripts/python.exe -m pip install -r backend/requirements.txt
   ```

3. If `backend/.env` does not exist, copy `backend/.env.example` to it. Keep any
   existing NVIDIA/Groq keys. These optional settings default to the values shown:

   ```env
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=gpt-oss:20b
   ```

4. Start the backend from the repository root:

   ```powershell
   ./backend/.venv.local/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
   ```

5. In another terminal at the repository root, run the frontend:

   ```powershell
   npm install
   $env:VITE_OFFICE_API_URL = "http://localhost:8000"
   npm run dev
   ```

   Open the URL Vite prints. The terminal should say `remote backend (live)`.
   Without `VITE_OFFICE_API_URL`, the frontend intentionally uses its unchanged
   demo simulation. Restart Vite after changing this variable.

## How requests work

The existing keyword router selects desks and starts background tasks. Each
local desk calls the shared `generate_ollama` helper using `httpx.AsyncClient`:

```json
{"model":"gpt-oss:20b","prompt":"user task","system":"desk-specific instructions","stream":false}
```

The backend POSTs this to `${OLLAMA_BASE_URL}/api/generate`, validates JSON and
reads a non-empty string from `response`. It yields that text into the existing
desk output. The browser continues polling FastAPI every 1.5 seconds and never
contacts Ollama. With `stream: false`, progress messages appear first and the
full generated answer appears once generation finishes; tokens are not streamed.

Connection timeout is 10 seconds; the entire request is capped at 300 seconds
to allow model loading and local inference. Connection errors, missing models,
HTTP failures, timeouts and malformed/empty responses trigger the existing
simulated sequence (explicitly labelled; no execution occurs). Output explicitly says `falling back to simulated output`;
that desk still completes. Logs contain desk ID and error category/HTTP status,
not request content, credentials, full URLs or raw error bodies.

## Verify real responses

Submit these orders separately, waiting for each to finish:

| Desk | Order |
| --- | --- |
| Frontend | `Frontend: suggest an accessible React button with TypeScript props.` |
| Security | `Security: identify three secrets management risks and safe mitigations.` |
| SQL | `SQL: suggest a PostgreSQL schema for books with an index on title.` |

Inspect each desk's output dialog. A successful call displays
`Ollama response received (live local generation):`, then a task-specific answer,
then `task complete.` A boot/connecting message alone does not prove success.
Fallback displays its explicit error marker and generic `executing step 1/3`
stages. The Provider A/B/C selector is existing placeholder metadata; dedicated
desk handlers determine the actual model.

You can also inspect results directly:

```powershell
$snapshot = Invoke-RestMethod http://localhost:8000/status
$snapshot.desks | Where-Object id -In frontend,security,sql | Format-List id,status,output
```

Ollama must be reachable from the machine running FastAPI; `localhost` on a
hosted backend refers to that host, not your Windows PC.

## Offline regression checks

```powershell
./backend/.venv.local/Scripts/python.exe -m unittest discover -s backend -v
```

These use mocked HTTP responses, with no NVIDIA/Groq charges or local inference.
They cover request shape, separate prompts, defaults/overrides, malformed data,
HTTP/connection errors, timeouts, safe logs and background-task completion when
one desk fails.

API reference: https://docs.ollama.com/api/generate
CLI reference: https://docs.ollama.com/cli


## Universal fallback and interactive private meetings

Provider order (normal tasks and private meetings use the same `run_agent`):

| Desk | Provider order |
| --- | --- |
| Backend | NVIDIA Nemotron 3 Super ? Ollama gpt-oss:20b ? simulation |
| Research | Groq GPT-OSS 20B ? Ollama gpt-oss:20b ? simulation |
| Debugger | Groq GPT-OSS 120B ? Ollama gpt-oss:20b ? simulation |
| Frontend, Security, SQL | Ollama gpt-oss:20b ? simulation |

`POST /agents/{agent_id}/message` accepts `{"message":"...","history":[]}`.
Each history entry has `role` (`user` or `assistant`) and `content`.
It directly invokes that desk's shared runner, without calling `pick_desks`,
changing normal desk outputs, dispatching the assistant, or creating task history.
Response: `{desk, response, provider, model}`. Normal `/status` desks additionally
expose `answered_by` and `model`; the existing provider selector is unchanged.
The six fixed desk chains take priority over that legacy placeholder selector.

History lives only in the mounted meeting dialog. The UI retains at most 24
messages and sends the last 12, each truncated to 4,000 characters. Backend
validation rejects larger histories; the shared prompt builder also bounds them.
The current prompt is preserved separately (maximum 16,000 characters). Closing,
refreshing, or changing meetings discards history. Closing aborts the browser
request and ignores late responses; generation already running on the server
may finish, but cannot reopen the UI or change normal task state.

Meeting states: walking/invited ? active ? thinking ? response received ? ended.
Send is disabled until arrival and while thinking. Ending sends the walker back
to its desk; if a normal task is running, its working state resumes. Polling stays
at 1.5 seconds, and normal keyword routing still selects at most three desks.

Hosted calls use the asynchronous OpenAI-compatible client, preserve NVIDIA/Groq
models and reasoning settings, stream text to normal output, and have a 90-second
whole-call deadline with no automatic SDK retries. Ollama has a 10-second connect
and 300-second whole-call deadline. Missing keys, authentication/rate-limit/other
HTTP errors, connection errors, timeouts, malformed data and empty answers all
advance the chain. Partial failed cloud output may remain in the task terminal,
followed by a fallback marker; meeting responses contain only the final answer.
Original prompts, desk identity and recent history are reused at every attempt.
No tools, commands, browsing, scans, file edits or SQL execution are added.

Server logs use `[AI OFFICE] <desk>: trying <provider>`,
`<provider> failed: <category or HTTP status>`, `falling back to Ollama`,
`<provider> response successful`, and `using simulated fallback`.
Provider values are `nvidia`, `groq`, `ollama`, and `simulated`.
Exception bodies and credentials are never logged by the agent runner.

No new dependency is required beyond the existing requirements (`httpx` and
`openai` are already included). No additional environment variables are required.

### Manual verification matrix

1. Run `ollama list`; confirm `gpt-oss:20b`. Start Ollama if necessary, then start
   FastAPI and Vite using the commands above. Verify the frontend says LIVE.
2. For each of Backend, Research, Frontend, Debugger, Security, SQL: click the
   agent card's pencil (Talk Privately). Check the selected name and role, watch
   its walk, and wait for Meeting active. Send a question. Check thinking and
   disabled Send, then a response and its provider label.
3. Ask Security `Review API key storage in a React SQL application`.
   Only Security should answer; the normal order history and other desks should
   be unchanged. Ask `Explain your second point` to check conversation context.
4. End Meeting (also test Escape and X). The walker returns to its desk. Reopen;
   the conversation is empty. Also close while thinking and reopen a different
   agent; the old response must not appear.
5. Send `api research frontend debug security sql` in the main order input.
   Backend, Research and Frontend should dispatch (three-desk cap), with normal
   progress, terminal output and task completion. Coffee, banter and minimap
   should continue outside the meeting.
6. To force hosted failure safely, launch a fresh backend terminal with
   `$env:NVIDIA_API_KEY='invalid-test-key'` and `$env:GROQ_API_KEY='invalid-test-key'`
   before starting uvicorn. Do not overwrite your saved `.env` keys. Submit a
   Backend, Research and Debugger task and private message for each; verify the
   failure log followed by an Ollama success and provider label.
7. With valid Groq credentials (remove the temporary overrides and restart),
   send a Research message and check `groq response successful` and the model.
8. Frontend, Security and SQL should directly log Ollama successes. Stop Ollama
   (or set `$env:OLLAMA_BASE_URL='http://127.0.0.1:11435'` in the test backend
   terminal and restart), keeping invalid cloud keys. Repeat all six desks:
   simulation must appear in both tasks and meetings, and `/status` stays usable.
9. Stop FastAPI while a meeting is open. Send: a friendly inline error should
   appear and the dialog should remain open with the prompt ready to retry.
10. Remove `VITE_OFFICE_API_URL` in the frontend terminal and restart Vite:
    `Remove-Item Env:VITE_OFFICE_API_URL -ErrorAction SilentlyContinue`.
    Repeat meeting open/send/follow-up/end for all desks in SIM mode, then submit
    a normal order. Restore the variable and restart for real backend mode.

Automated checks from repository root:

```powershell
./backend/.venv.local/Scripts/python.exe -m unittest discover -s backend -v
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run build
```

### Implementation inventory

Modified: `backend/agents.py`, `backend/main.py`, `backend/.env.example`,
`backend/test_ollama.py`, `backend/README.md`, `src/lib/office-api.ts`,
`src/hooks/useOfficeScene.ts`, `src/routes/index.tsx`.
New component: `src/components/office/PrivateMeetingDialog.tsx`.

New backend helpers: `build_prompt`, `failure_reason`, `call_primary`;
`run_agent` now owns the reusable fallback chain. Existing `generate_ollama`
and `_simulated` are reused (simulation stages explicitly say simulating).
New endpoint function: `post_agent_message`; request/response models:
`MeetingMessage`, `MeetingRequest`, `MeetingResponse`.
Frontend additions: `officeApi.sendPrivateMessage`, `endMeeting`,
`PrivateMeetingDialog` (with local `send` and `close` handlers),
`MeetingMessage`/`MeetingResponse` types. Added backend tests cover cloud success,
empty responses, mid-stream failure, prompt preservation, all six direct targets,
context limits, request validation, simulation, unexpected errors and router caps.


### Verification results for this change

- 10 offline backend tests passed, including mocked HTTP 401/429/503,
  malformed/empty SSE, successful Groq-compatible streaming, and Ollama failures.
- TypeScript checking and ESLint on the four changed frontend files passed.
- Production Vite build passed.
- Live Ollama `/api/tags` confirmed `gpt-oss:20b`; a real Backend request with
  NVIDIA unavailable fell back to Ollama and returned: ?I specialize in backend
  engineering with Python and FastAPI.?
- Live NVIDIA/Groq success was not tested. Browser interaction was not verified
  because no browser was connected; use the manual matrix above for visual QA.
