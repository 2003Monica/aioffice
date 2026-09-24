"""
FastAPI backend for the AI Office dashboard.

Implements the contract defined by the frontend at src/lib/office-api.ts:

    POST /task                     { task }            -> StatusResponse
    GET  /status                                       -> StatusResponse
    POST /desk/{desk_id}/provider  { provider }        -> StatusResponse

State lives in memory (single-process dev server). Each dispatched desk runs
its agent in a background asyncio task so /task returns immediately while
work streams into desk.output over time.
"""

import asyncio
import re
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents import run_agent

app = FastAPI(title="AI Office backend")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

PROVIDERS = ["Provider A", "Provider B", "Provider C"]

DESK_META = [
    {"id": "backend", "name": "BACKEND", "keywords": ["api", "endpoint", "server", "logic", "backend", "auth", "authentication", "login", "session", "password"]},
    {"id": "research", "name": "RESEARCH", "keywords": ["research", "compare", "evaluate", "investigate", "explore", "analyze", "best practice"]},
    {"id": "frontend", "name": "FRONTEND", "keywords": ["ui", "css", "component", "react", "frontend", "layout", "style", "navbar", "button", "page"]},
    {"id": "debugger", "name": "DEBUGGER", "keywords": ["debug", "bug", "error", "exception", "stack trace", "traceback", "crash", "fix", "troubleshoot", "root cause", "reproduce", "breakpoint", "null pointer", "undefined", "segfault"]},
    {"id": "security", "name": "SECURITY", "keywords": ["security", "vulnerability", "exploit", "encrypt", "permissions", "auth", "login", "password", "secure"]},
    {"id": "sql", "name": "SQL / DATABASE", "keywords": ["database", "schema", "sql", "query", "table", "migration", "model", "orm"]},
]


class Desk(BaseModel):
    id: str
    name: str
    status: str  # "idle" | "working" | "done"
    current_task: str | None
    output: list[str]
    provider: str
    answered_by: str | None = None
    model: str | None = None


class Assistant(BaseModel):
    state: str  # "idle" | "dispatching" | "returning"
    route: list[str]


class StatusResponse(BaseModel):
    desks: list[Desk]
    assistant: Assistant


class TaskRequest(BaseModel):
    task: str


class ProviderRequest(BaseModel):
    provider: str


desks: dict[str, Desk] = {
    meta["id"]: Desk(
        id=meta["id"],
        name=meta["name"],
        status="idle",
        current_task=None,
        output=[],
        provider=PROVIDERS[0],
    )
    for meta in DESK_META
}

assistant = Assistant(state="idle", route=[])


def snapshot() -> StatusResponse:
    return StatusResponse(desks=list(desks.values()), assistant=assistant)


def _keyword_matches(text: str, keyword: str) -> bool:
    """
    Whole-word(ish) match: \\b anchors on both ends so a short keyword like
    "ui" or "orm" can't fire on a fragment buried inside an unrelated word
    (e.g. "orm" inside "performance", "api" inside "rapid", "ui" inside
    "build"/"guide"). Multi-word keywords like "best practice" or "ci/cd"
    work too since \\b only needs to anchor on their outer, alphanumeric
    edges.
    """
    return re.search(rf"\b{re.escape(keyword)}\b", text) is not None


def pick_desks(task: str) -> list[str]:
    t = task.lower()
    matched = [meta["id"] for meta in DESK_META if any(_keyword_matches(t, k) for k in meta["keywords"])]
    if matched:
        return matched[:3]
    # fall back to two pseudo-random desks so every order dispatches someone
    ids = [meta["id"] for meta in DESK_META]
    start = len(task) % len(ids)
    return [ids[start], ids[(start + 2) % len(ids)]]


async def work_desk(desk_id: str, task: str) -> None:
    desk = desks[desk_id]
    result = {}
    async for line in run_agent(desk_id, desk.provider, task, result=result):
        desk.output.append(line)
    desk.answered_by = result.get("provider")
    desk.model = result.get("model")
    desk.status = "done"

    if assistant.state == "dispatching" and all(desks[d].status == "done" for d in assistant.route):
        assistant.state = "returning"


@app.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    return snapshot()


@app.post("/task", response_model=StatusResponse)
async def post_task(body: TaskRequest) -> StatusResponse:
    targets = pick_desks(body.task)
    for desk_id in targets:
        desk = desks[desk_id]
        desk.status = "working"
        desk.current_task = body.task
        desk.output = []
        desk.answered_by = None
        desk.model = None
        asyncio.create_task(work_desk(desk_id, body.task))

    assistant.state = "dispatching"
    assistant.route = targets
    return snapshot()


@app.post("/desk/{desk_id}/provider", response_model=StatusResponse)
async def post_provider(desk_id: str, body: ProviderRequest) -> StatusResponse:
    desk = desks.get(desk_id)
    if desk is None:
        raise HTTPException(status_code=404, detail=f"unknown desk: {desk_id}")
    desk.provider = body.provider
    return snapshot()


@app.post("/assistant/clear", response_model=StatusResponse)
async def post_assistant_clear() -> StatusResponse:
    assistant.state = "idle"
    assistant.route = []
    return snapshot()


class MeetingMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class MeetingRequest(BaseModel):
    message: str = Field(min_length=1, max_length=16000)
    history: list[MeetingMessage] = Field(default_factory=list, max_length=12)


class MeetingResponse(BaseModel):
    desk: str
    response: str
    provider: str
    model: str | None


@app.post("/agents/{agent_id}/message", response_model=MeetingResponse)
async def post_agent_message(agent_id: str, body: MeetingRequest) -> MeetingResponse:
    if agent_id not in desks:
        raise HTTPException(status_code=404, detail="Unknown agent")
    if not body.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be blank")
    result = {}
    try:
        async for _ in run_agent(agent_id, desks[agent_id].provider, body.message,
                                 context=[m.model_dump() for m in body.history], result=result):
            pass
        return MeetingResponse(desk=agent_id, **result)
    except Exception:
        raise HTTPException(status_code=503, detail="Unable to respond. Please retry.") from None
