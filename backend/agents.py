"""
Per-desk agent runner.

`run_agent` yields output lines one at a time as an agent works a task.
Frontend, security and sql call local Ollama through a shared async client.
Three desks make real streaming calls to a hosted LLM,
each falling back to the same simulated staged output if its API call fails
for any reason, so a desk always completes instead of hanging or crashing,
and one provider being down never affects the others:

  - backend  -> NVIDIA Nemotron 3 Super  (`_run_backend_nemotron`)
  - research -> Groq GPT-OSS 20B, medium reasoning  (`_run_research_groq`)
  - debugger -> Groq GPT-OSS 120B, high reasoning   (`_run_debugger_groq`)

The Backend/Nemotron path predates the other two and is kept as its own
standalone implementation. Research and Debugger both call Groq and share a
generic `_run_live`/`_stream_completion_sync` helper, differing only in
model and reasoning_effort (passed through **extra_params).

To wire a real provider into another desk later, either branch on desk_id
the same way `run_agent` does, or register a handler in PROVIDER_HANDLERS
keyed by provider name -- the endpoint code in main.py never needs to
change either way.
"""

import asyncio
import logging
import os
import random
from collections.abc import AsyncIterator, Callable

from openai import OpenAI
import httpx

logger = logging.getLogger(__name__)

NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b"
NEMOTRON_BASE_URL = "https://integrate.api.nvidia.com/v1"

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_RESEARCH_MODEL = "openai/gpt-oss-20b"
GROQ_DEBUGGER_MODEL = "openai/gpt-oss-120b"


async def _simulated(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    name = desk_id.upper()
    stages = [
        f"> booting {name.lower()} agent [{provider}]",
        f'> parsing order: "{task[:48]}"',
        "> drafting plan ...",
        "> executing step 1/3",
        "> executing step 2/3",
        "> executing step 3/3",
    ]
    for line in stages:
        yield line
        await asyncio.sleep(0.8 + random.random() * 0.7)
    yield "> task complete."


# --------------------------- backend / Nemotron --------------------------- #


def _stream_nemotron_sync(task: str, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
    """
    Runs on a worker thread (via asyncio.to_thread): drives the blocking
    OpenAI SDK stream and hands each text chunk back to the event loop
    through `queue`. Any exception is pushed onto the queue instead of
    raised here, since this function has no async caller to propagate to.
    """
    try:
        client = OpenAI(base_url=NEMOTRON_BASE_URL, api_key=os.environ["NVIDIA_API_KEY"])
        completion = client.chat.completions.create(
            model=NEMOTRON_MODEL,
            messages=[{"role": "user", "content": f"You are a backend software engineering assistant. Task: {task}"}],
            temperature=1,
            top_p=0.95,
            max_tokens=2048,
            stream=True,
        )
        for chunk in completion:
            delta = chunk.choices[0].delta.content
            if delta:
                loop.call_soon_threadsafe(queue.put_nowait, delta)
    except Exception as exc:  # surfaced to the async side via the queue
        loop.call_soon_threadsafe(queue.put_nowait, exc)
    finally:
        loop.call_soon_threadsafe(queue.put_nowait, None)


async def _run_backend_nemotron(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    yield "> booting backend agent [Nemotron 3 Super via NVIDIA]"
    yield f'> parsing order: "{task[:48]}"'

    if not os.environ.get("NVIDIA_API_KEY"):
        yield "> Nemotron API error (NVIDIA_API_KEY not set) — falling back to simulated output"
        async for line in _simulated(desk_id, provider, task):
            yield line
        return

    yield "> connecting to Nemotron 3 Super ..."

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    # Keep a reference for the life of this generator -- asyncio only holds
    # a weak reference to a created task, so an unreferenced one can be
    # garbage-collected mid-run.
    producer_task = asyncio.create_task(asyncio.to_thread(_stream_nemotron_sync, task, queue, loop))

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item
    except Exception as exc:
        yield f"> Nemotron API error ({exc}) — falling back to simulated output"
        async for line in _simulated(desk_id, provider, task):
            yield line
        return
    finally:
        await producer_task

    yield "> task complete."


# ------------------- generic OpenAI-compatible streaming ------------------ #


def _stream_completion_sync(
    *,
    base_url: str,
    api_key: str,
    model: str,
    content: str,
    max_tokens: int,
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
    **extra_params,
) -> None:
    """Same shape as `_stream_nemotron_sync`, generalized over provider config."""
    try:
        client = OpenAI(base_url=base_url, api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            max_tokens=max_tokens,
            stream=True,
            **extra_params,
        )
        for chunk in completion:
            delta = chunk.choices[0].delta.content
            if delta:
                loop.call_soon_threadsafe(queue.put_nowait, delta)
    except Exception as exc:  # surfaced to the async side via the queue
        loop.call_soon_threadsafe(queue.put_nowait, exc)
    finally:
        loop.call_soon_threadsafe(queue.put_nowait, None)


async def _run_live(
    desk_id: str,
    provider: str,
    task: str,
    *,
    label: str,
    api_key_env: str,
    base_url: str,
    model: str,
    system_prompt: str,
    max_tokens: int = 2048,
    **extra_params,
) -> AsyncIterator[str]:
    """
    Shared real-provider path used by Research and Debugger (both Groq):
    boot/connect status lines, a threaded streaming call, a "task complete"
    line, and a fallback to `_simulated()` on any failure (missing key, bad
    key, rate limit, network error) so the desk always completes.
    Independent per call -- one desk's provider failing has no effect on
    any other desk.
    """
    yield f"> booting {desk_id} agent [{label}]"
    yield f'> parsing order: "{task[:48]}"'

    api_key = os.environ.get(api_key_env)
    if not api_key:
        yield f"> {label} API error ({api_key_env} not set) — falling back to simulated output"
        async for line in _simulated(desk_id, provider, task):
            yield line
        return

    yield f"> connecting to {label} ..."

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    content = f"{system_prompt} Task: {task}"
    producer_task = asyncio.create_task(
        asyncio.to_thread(
            _stream_completion_sync,
            base_url=base_url,
            api_key=api_key,
            model=model,
            content=content,
            max_tokens=max_tokens,
            queue=queue,
            loop=loop,
            **extra_params,
        )
    )

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item
    except Exception as exc:
        yield f"> {label} API error ({exc}) — falling back to simulated output"
        async for line in _simulated(desk_id, provider, task):
            yield line
        return
    finally:
        await producer_task

    yield "> task complete."


async def _run_research_groq(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    async for line in _run_live(
        desk_id,
        provider,
        task,
        label="GPT-OSS 20B via Groq",
        api_key_env="GROQ_API_KEY",
        base_url=GROQ_BASE_URL,
        model=GROQ_RESEARCH_MODEL,
        system_prompt="You are a research assistant.",
        reasoning_effort="medium",
        top_p=1,
    ):
        yield line


async def _run_debugger_groq(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    async for line in _run_live(
        desk_id,
        provider,
        task,
        label="GPT-OSS 120B via Groq",
        api_key_env="GROQ_API_KEY",
        base_url=GROQ_BASE_URL,
        model=GROQ_DEBUGGER_MODEL,
        system_prompt="You are a debugging assistant.",
        reasoning_effort="high",
        top_p=1,
    ):
        yield line


# --------------------------- local Ollama ------------------------------- #

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


async def _run_ollama(
    desk_id: str, provider: str, task: str, *, system_prompt: str
) -> AsyncIterator[str]:
    yield f"> booting {desk_id} agent [Ollama]"
    yield "> connecting to local Ollama; waiting for generated text ..."
    try:
        generated = await generate_ollama(task, system_prompt)
    except Exception as exc:
        # Never log exception text, URLs, response bodies, or prompts: these
        # can contain credentials or user data. Categories/status are enough
        # to distinguish an offline service, timeout, missing model or bad JSON.
        if isinstance(exc, httpx.HTTPStatusError):
            reason = f"HTTP {exc.response.status_code}; check Ollama and model availability"
        elif isinstance(exc, (httpx.TimeoutException, TimeoutError)):
            reason = "request timed out"
        elif isinstance(exc, httpx.ConnectError):
            reason = "connection failed; check OLLAMA_BASE_URL and that Ollama is running"
        elif isinstance(exc, ValueError):
            reason = "malformed response or invalid configuration"
        else:
            reason = type(exc).__name__
        logger.warning("Ollama desk=%s failed (%s); using simulated output", desk_id, reason)
        yield f"> Ollama error ({reason}) - falling back to simulated output"
        async for line in _simulated(desk_id, provider, task):
            yield line
        return

    yield "> Ollama response received (live local generation):"
    yield generated
    yield "> task complete."


async def _run_frontend_ollama(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    async for line in _run_ollama(
        desk_id, provider, task,
        system_prompt=(
            "You are the Frontend Engineer for AI Office. Specialize in React, TypeScript, "
            "TanStack Start/Router, Tailwind CSS, shadcn/Radix, UI/UX, component architecture, "
            "accessibility and frontend debugging. Answer only from the frontend specialist's "
            "perspective. Generate text and suggested code only. You cannot execute commands, "
            "edit files or modify repositories; never claim you performed those actions."
        ),
    ):
        yield line


async def _run_security_ollama(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    async for line in _run_ollama(
        desk_id, provider, task,
        system_prompt=(
            "You are the Security Engineer for AI Office. Specialize in application security, "
            "API security, authentication, authorization, secrets management, dependency risks, "
            "OWASP issues, secure coding and threat analysis. Identify risks and suggest safe "
            "fixes from the security specialist's perspective. Generate text only. You cannot "
            "execute commands, scan systems, edit files or modify repositories. Never pretend "
            "you actually executed security scans; distinguish analysis from verified findings."
        ),
    ):
        yield line


async def _run_sql_ollama(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    async for line in _run_ollama(
        desk_id, provider, task,
        system_prompt=(
            "You are the Database Engineer for AI Office. Specialize in SQL, schema design, "
            "PostgreSQL, database architecture, indexes, query optimization, migrations, data "
            "modelling and persistence. Answer from the database specialist's perspective. "
            "Generate text and suggested SQL only. You cannot execute SQL or commands, edit "
            "files or modify repositories. Clearly label SQL as suggested and not executed; "
            "never claim database changes or query results you have not actually observed."
        ),
    ):
        yield line


# Optional provider handlers for desks without a dedicated handler.
# Unlisted providers fall back to simulation.
PROVIDER_HANDLERS: dict[str, Callable[[str, str, str], AsyncIterator[str]]] = {}

# desk_id -> real-call handler, checked before PROVIDER_HANDLERS.
DESK_HANDLERS: dict[str, Callable[[str, str, str], AsyncIterator[str]]] = {
    "backend": _run_backend_nemotron,
    "research": _run_research_groq,
    "debugger": _run_debugger_groq,
    "frontend": _run_frontend_ollama,
    "security": _run_security_ollama,
    "sql": _run_sql_ollama,
}


async def run_agent(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    desk_handler = DESK_HANDLERS.get(desk_id)
    if desk_handler is not None:
        async for line in desk_handler(desk_id, provider, task):
            yield line
        return

    handler = PROVIDER_HANDLERS.get(provider, _simulated)
    async for line in handler(desk_id, provider, task):
        yield line
