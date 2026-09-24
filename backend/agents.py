"""Shared desk provider chain for normal tasks and private meetings."""
import asyncio
import logging
import os
import random
from collections.abc import AsyncIterator
from openai import AsyncOpenAI
import httpx

logger = logging.getLogger("uvicorn.error")
CLOUD_TIMEOUT_SECONDS = 90.0
NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b"
NEMOTRON_BASE_URL = "https://integrate.api.nvidia.com/v1"

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_RESEARCH_MODEL = "openai/gpt-oss-20b"
GROQ_DEBUGGER_MODEL = "openai/gpt-oss-120b"


SYSTEM_PROMPTS = {'frontend': "You are the Frontend Engineer for AI Office. Specialize in React, TypeScript, TanStack Start/Router, Vite, Tailwind CSS, shadcn/Radix, UI/UX, component architecture, accessibility and frontend debugging. Answer only from the frontend specialist's perspective. Generate text and suggested code only. You cannot execute commands, edit files or modify repositories; never claim you performed those actions.", 'security': "You are the Security Engineer for AI Office. Specialize in application security, API security, authentication, authorization, secrets management, dependency risks, OWASP issues, secure coding and threat analysis. Identify risks and suggest safe fixes from the security specialist's perspective. Generate text only. You cannot execute commands, scan systems, edit files or modify repositories. Never pretend you actually executed security scans; distinguish analysis from verified findings.", 'sql': "You are the Database Engineer for AI Office. Specialize in SQL, schema design, PostgreSQL, database architecture, indexes, query optimization, migrations, data modelling and persistence. Answer from the database specialist's perspective. Generate text and suggested SQL only. You cannot execute SQL or commands, edit files or modify repositories. Clearly label SQL as suggested and not executed; never claim database changes or query results you have not actually observed.", 'backend': 'You are the Backend Engineer. Specialize in Python, FastAPI, APIs, backend architecture, async processing, integrations, server-side debugging and performance.', 'research': 'You are the Research assistant. Organize findings, compare approaches, identify assumptions, summarize evidence and explain uncertainty. No live internet research is available.', 'debugger': 'You are the Debugger. Read errors and stack traces, find bugs and root causes, suggest minimal fixes and explain why bugs occur. Never claim code was executed.'}

async def _simulated(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    name = desk_id.upper()
    stages = [
        f"> booting {name.lower()} agent [{provider}]",
        f'> parsing order: "{task[:48]}"',
        "> drafting plan ...",
        "> simulating step 1/3",
        "> simulating step 2/3",
        "> simulating step 3/3",
    ]
    for line in stages:
        yield line
        await asyncio.sleep(0.8 + random.random() * 0.7)
    yield "> task complete."


OLLAMA_TIMEOUT_SECONDS = 300.0


async def generate_ollama(task: str, system_prompt: str) -> str:
    """Generate text locally without blocking the FastAPI event loop."""
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "gpt-oss:20b")
    # Bound both individual HTTP operations and the complete request.
    async with asyncio.timeout(OLLAMA_TIMEOUT_SECONDS):
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(OLLAMA_TIMEOUT_SECONDS, connect=10.0),
            trust_env=False,
        ) as client:
            response = await client.post(
                f"{base_url}/api/generate",
                json={"model": model, "prompt": task, "system": system_prompt, "stream": False},
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or "error" in payload:
                raise ValueError("invalid Ollama response")
            generated = payload.get("response")
            if not isinstance(generated, str) or not generated.strip():
                raise ValueError("missing or empty Ollama response text")
            return generated


def build_prompt(task: str, context: list[dict] | None = None) -> str:
    if not context:
        return task
    history = "\n".join(f"{m['role']}: {m['content'][:4000]}" for m in context[-12:])
    return f"Recent conversation (context only):\n{history}\n\nCurrent user message:\n{task}"


def failure_reason(exc: Exception) -> str:
    # Exception bodies can contain credentials; log only categories/status codes.
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)) or "Timeout" in type(exc).__name__:
        return "request timed out"
    status = getattr(exc, "status_code", None)
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
    return f"HTTP {status}" if status else type(exc).__name__


async def call_primary(desk_id: str, prompt: str, system: str) -> AsyncIterator[str]:
    backend = desk_id == "backend"
    key = os.environ.get("NVIDIA_API_KEY" if backend else "GROQ_API_KEY")
    if not key:
        raise ValueError("missing API key")
    model = NEMOTRON_MODEL if backend else GROQ_RESEARCH_MODEL if desk_id == "research" else GROQ_DEBUGGER_MODEL
    params = {"temperature": 1, "top_p": 0.95} if backend else {"reasoning_effort": "medium" if desk_id == "research" else "high", "top_p": 1}
    async with asyncio.timeout(CLOUD_TIMEOUT_SECONDS):
        async with AsyncOpenAI(base_url=NEMOTRON_BASE_URL if backend else GROQ_BASE_URL,
                               api_key=key, timeout=CLOUD_TIMEOUT_SECONDS, max_retries=0) as client:
            stream = await client.chat.completions.create(
                model=model, messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                max_tokens=2048, stream=True, **params)
            chunks = []
            async with stream:
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    content = chunk.choices[0].delta.content
                    if content is not None:
                        if not isinstance(content, str):
                            raise ValueError("malformed content")
                        chunks.append(content)
                        yield content
            answer = "".join(chunks)
            if not answer.strip():
                raise ValueError("empty response")


async def run_agent(desk_id: str, provider: str, task: str, *,
                    context: list[dict] | None = None, result: dict | None = None,
                    synthesis: bool = False) -> AsyncIterator[str]:
    metadata = result if result is not None else {}
    system = SYSTEM_PROMPTS[desk_id] + " Generate text and suggested code only. No tools, browsing, filesystem, shell, SQL execution or scans are available. Never claim to have performed actions."
    if synthesis:
        system = (f"You are the {desk_id} specialist acting as AI Office's final report editor. "
                  "Integrate all supplied specialist contributions into a coherent answer across disciplines. "
                  "Respect review corrections, cite specialist attribution where helpful, and expose unresolved contradictions. "
                  "No execution, tools, filesystem access, scans or live browsing occurred. Generate text only; "
                  "never claim simulated or unavailable contributions were verified.")
    prompt = build_prompt(task, context)
    hosted = desk_id in ("backend", "research", "debugger")
    chain = (["nvidia" if desk_id == "backend" else "groq"] if hosted else []) + ["ollama"]
    yield f"> booting {desk_id} agent"
    for source in chain:
        logger.info("[AI OFFICE] %s: trying %s", desk_id, source)
        yield f"> connecting to {source} ..."
        try:
            if source == "ollama":
                answer = await generate_ollama(prompt, system)
            else:
                chunks = []
                async for chunk in call_primary(desk_id, prompt, system):
                    chunks.append(chunk)
                    yield chunk
                answer = "".join(chunks)
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError("empty response")
        except Exception as exc:
            reason = failure_reason(exc)
            logger.warning("[AI OFFICE] %s: %s failed: %s", desk_id, source, reason)
            fallback = "Ollama" if source != "ollama" else "simulated output"
            logger.info("[AI OFFICE] %s: falling back to %s", desk_id, fallback)
            yield f"> {source} failed ({reason}) - falling back to {fallback}"
            continue
        model = os.environ.get("OLLAMA_MODEL", "gpt-oss:20b") if source == "ollama" else NEMOTRON_MODEL if source == "nvidia" else GROQ_RESEARCH_MODEL if desk_id == "research" else GROQ_DEBUGGER_MODEL
        metadata.update(provider=source, model=model, response=answer)
        logger.info("[AI OFFICE] %s: %s response successful", desk_id, source)
        yield f"> {source} response received" + (" (live local generation):" if source == "ollama" else ":")
        if source == "ollama":
            yield answer
        yield "> task complete."
        return
    logger.info("[AI OFFICE] %s: using simulated fallback", desk_id)
    answer = f"[Simulated {desk_id} response] Real providers are unavailable. Request received: {task}. No actions were executed. Please retry when a provider is available."
    metadata.update(provider="simulated", model=None, response=answer)
    yield answer
    async for line in _simulated(desk_id, "simulated", task):
        yield line
