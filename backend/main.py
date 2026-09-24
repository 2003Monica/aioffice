"""
FastAPI backend for the AI Office dashboard.

Implements the contract defined by the frontend at src/lib/office-api.ts:

    POST /task                     { task }            -> StatusResponse
    GET  /status                                       -> StatusResponse
    POST /desk/{desk_id}/provider  { provider }        -> StatusResponse

State lives in memory (single-process dev server). Each office order runs
a dependency-aware coordinator in a background asyncio task so /task returns
immediately while assignments, handoffs and final reports appear in /status.
"""

from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents import run_agent
from orchestrator import OfficeCoordinator, TaskWorkspace, create_workspace

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
    status: str  # idle, waiting, working, reviewing, revising, synthesizing, done
    current_task: str | None
    output: list[str]
    provider: str
    answered_by: str | None = None
    model: str | None = None
    task_id: str | None = None
    activity: str | None = None


class Assistant(BaseModel):
    state: str  # "idle" | "dispatching" | "returning"
    route: list[str]


class StatusResponse(BaseModel):
    desks: list[Desk]
    assistant: Assistant
    tasks: list[TaskWorkspace] = Field(default_factory=list)


class TaskRequest(BaseModel):
    task: str = Field(min_length=1, max_length=16000)


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
coordinator = OfficeCoordinator(desks, assistant)


def snapshot() -> StatusResponse:
    return StatusResponse(desks=list(desks.values()), assistant=assistant, tasks=coordinator.tasks).model_copy(deep=True)


def pick_desks(task: str) -> list[str]:
    """Compatibility helper: desk selection now belongs to the collaboration planner."""
    return [assignment.agent for assignment in create_workspace(task).plan]


@app.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    return snapshot()


@app.post("/task", response_model=StatusResponse)
async def post_task(body: TaskRequest) -> StatusResponse:
    if not body.task.strip():
        raise HTTPException(status_code=422, detail="Task cannot be blank")
    try:
        coordinator.start(body.task.strip())
    except ValueError:
        raise HTTPException(status_code=409, detail="An office task is already running. Wait for its final report.") from None
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
    if coordinator.busy:
        return snapshot()
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
