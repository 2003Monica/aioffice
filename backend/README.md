# AI Office backend

Requires Python 3.11+ and a local Ollama installation. Backend uses NVIDIA,
Research/Debugger use Groq, and Frontend/Security/SQL use Ollama. Agents produce
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
simulated sequence. Output explicitly says `falling back to simulated output`;
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
