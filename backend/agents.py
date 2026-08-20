"""
Per-desk agent runner.

`run_agent` yields output lines one at a time as an agent works a task. Five
of the six desks (research, frontend, devops, security, sql) are still fully
simulated placeholders via `_simulated`. The Backend desk makes a real
streaming call to NVIDIA's hosted Nemotron 3 Super model
(`_run_backend_nemotron`), falling back to the same simulated staged output
if the API call fails for any reason, so the desk always completes instead
of hanging or crashing.

To wire a real provider into another desk later, either branch on desk_id
the same way `run_agent` does for "backend", or register a handler in
PROVIDER_HANDLERS keyed by provider name -- the endpoint code in main.py
never needs to change either way.
"""

import asyncio
import os
import random
from collections.abc import AsyncIterator, Callable

from openai import OpenAI

NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b"
NEMOTRON_BASE_URL = "https://integrate.api.nvidia.com/v1"


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


# Map a provider name (must match PROVIDERS in office-api.ts) to a handler
# for the still-simulated desks. Unlisted providers fall back to the
# simulation.
PROVIDER_HANDLERS: dict[str, Callable[[str, str, str], AsyncIterator[str]]] = {}


async def run_agent(desk_id: str, provider: str, task: str) -> AsyncIterator[str]:
    if desk_id == "backend":
        async for line in _run_backend_nemotron(desk_id, provider, task):
            yield line
        return

    handler = PROVIDER_HANDLERS.get(provider, _simulated)
    async for line in handler(desk_id, provider, task):
        yield line
