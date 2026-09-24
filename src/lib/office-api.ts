/**
 * API layer for the AI Office dashboard.
 *
 * Swap mock data for the real FastAPI backend by setting
 * VITE_OFFICE_API_URL (e.g. "http://localhost:8000"). When it is unset the
 * module falls back to an in-memory mock that mimics the same contract:
 *
 *   POST /task                     { task }            -> StatusResponse
 *   GET  /status                                       -> StatusResponse
 *   POST /desk/{desk_id}/provider  { provider }        -> StatusResponse
 *   POST /assistant/clear                              -> StatusResponse
 */

import {
  createDemoTask,
  taskFinished,
  type OfficeTask,
  type Assignment,
  type WorkflowPhase,
} from "./office-collaboration";

export type DeskStatus = "idle" | Exclude<WorkflowPhase, "skipped">;
export type AssistantState = "idle" | "dispatching" | "returning";

export interface Desk {
  id: string;
  name: string;
  status: DeskStatus;
  current_task: string | null;
  output: string[];
  provider: string;
  answered_by?: string | null;
  model?: string | null;
  task_id?: string | null;
  activity?: string | null;
}

export interface MeetingMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MeetingResponse {
  desk: string;
  response: string;
  provider: "nvidia" | "groq" | "ollama" | "simulated";
  model: string | null;
}

export interface Assistant {
  state: AssistantState;
  /** Ordered desk ids the assistant should visit for the active dispatch. */
  route: string[];
}

export interface StatusResponse {
  desks: Desk[];
  assistant: Assistant;
  tasks: OfficeTask[];
}

export const PROVIDERS = ["Provider A", "Provider B", "Provider C"] as const;

export const DESK_META: {
  id: string;
  name: string;
  color: string;
  keywords: string[];
}[] = [
  {
    id: "backend",
    name: "BACKEND",
    color: "var(--desk-backend)",
    keywords: [
      "api",
      "endpoint",
      "server",
      "logic",
      "backend",
      "auth",
      "authentication",
      "login",
      "session",
      "password",
    ],
  },
  {
    id: "research",
    name: "RESEARCH",
    color: "var(--desk-research)",
    keywords: [
      "research",
      "compare",
      "evaluate",
      "investigate",
      "explore",
      "analyze",
      "best practice",
    ],
  },
  {
    id: "frontend",
    name: "FRONTEND",
    color: "var(--desk-frontend)",
    keywords: [
      "ui",
      "css",
      "component",
      "react",
      "frontend",
      "layout",
      "style",
      "navbar",
      "button",
      "page",
    ],
  },
  {
    id: "debugger",
    name: "DEBUGGER",
    color: "var(--desk-debugger)",
    keywords: [
      "debug",
      "bug",
      "error",
      "exception",
      "stack trace",
      "traceback",
      "crash",
      "fix",
      "troubleshoot",
      "root cause",
      "reproduce",
      "breakpoint",
      "null pointer",
      "undefined",
      "segfault",
    ],
  },
  {
    id: "security",
    name: "SECURITY",
    color: "var(--desk-security)",
    keywords: [
      "security",
      "vulnerability",
      "exploit",
      "encrypt",
      "permissions",
      "auth",
      "login",
      "password",
      "secure",
    ],
  },
  {
    id: "sql",
    name: "SQL / DATABASE",
    color: "var(--desk-sql)",
    keywords: ["database", "schema", "sql", "query", "table", "migration", "model", "orm"],
  },
];

const BASE_URL = import.meta.env["VITE_OFFICE_API_URL"] as string | undefined;

/* ------------------------------- mock store ------------------------------ */

const mockDesks: Desk[] = DESK_META.map((d) => ({
  id: d.id,
  name: d.name,
  status: "idle",
  current_task: null,
  output: [],
  provider: PROVIDERS[0],
}));
let mockAssistant: Assistant = { state: "idle", route: [] };
let mockTasks: OfficeTask[] = [];
let mockStep: {
  assignment: Assignment;
  phase: "working" | "reviewing" | "revising" | "synthesizing";
  finishAt: number;
} | null = null;
const mockRevisions = new Set<string>();

function mockEvent(
  task: OfficeTask,
  sender: string,
  kind: string,
  text: string,
  recipient: string | null = null,
) {
  task.messages.push({
    id: task.messages.length + 1,
    ts: Date.now() / 1000,
    sender,
    kind,
    text,
    recipient,
  });
}

function startMockStep(
  task: OfficeTask,
  assignment: Assignment,
  phase: NonNullable<typeof mockStep>["phase"],
) {
  const desk = mockDesks.find((d) => d.id === assignment.agent)!;
  assignment.state = phase;
  desk.status = phase;
  desk.activity =
    phase === "reviewing"
      ? assignment.agent === "debugger"
        ? "Checking integration"
        : "Reviewing"
      : phase === "revising"
        ? "Applying review corrections"
        : phase === "synthesizing"
          ? "Combining office report"
          : "Working";
  desk.output.push(`> ${desk.activity}: ${assignment.subtask}`);
  mockEvent(task, assignment.agent, phase, desk.activity);
  if (phase === "working" || phase === "reviewing") {
    for (const id of assignment.depends_on)
      mockEvent(
        task,
        id,
        "handoff",
        task.agent_results[id]!.response.slice(0, 600),
        assignment.agent,
      );
  }
  mockStep = { assignment, phase, finishAt: Date.now() + 2400 };
}

function finishMock(task: OfficeTask) {
  task.status = "partial";
  task.finished_at = Date.now() / 1000;
  task.synthesis_provider = "simulated";
  const handoffs = task.plan
    .filter((a) => a.depends_on.length)
    .map((a) => `${a.depends_on.join(" + ")} -> ${a.agent}`)
    .join("; ");
  task.final_report = `FINAL OFFICE REPORT - DEMO\n\n${task.original_task}\n\nCoordinated plan: ${task.plan.map((a) => a.agent.toUpperCase()).join(" -> ")}.\n${handoffs ? `Handoffs: ${handoffs}. Incorporate the review corrections before implementation.` : "This request needs only the selected specialist's contribution."}\n\n${task.plan.map((a) => `${a.agent.toUpperCase()}: ${task.agent_results[a.agent]!.response}`).join("\n\n")}\n\nThis illustrates the workflow; no model ran and no implementation was executed.`;
  mockEvent(task, "coordinator", "finished", "Demo office report ready.");
  mockAssistant.state = "returning";
}

function tickMock() {
  const task = mockTasks.at(-1);
  if (!task || taskFinished(task)) return;
  if (mockStep) {
    if (Date.now() < mockStep.finishAt) return;
    const { assignment, phase } = mockStep;
    const desk = mockDesks.find((d) => d.id === assignment.agent)!;
    const dependencyNames = assignment.depends_on.join(", ");
    const response =
      phase === "revising"
        ? `[Demo revision] Updated ${assignment.agent} contribution after review; align the shared API contract and secure token handling.`
        : `[Demo ${assignment.kind}] ${assignment.subtask}${dependencyNames ? ` Using handoffs from ${dependencyNames}.` : ""}`;
    desk.output.push(response);
    desk.answered_by = "simulated";
    desk.model = null;
    desk.status = "done";
    desk.activity = "Contribution ready";
    assignment.state = "done";
    mockEvent(task, assignment.agent, "completed", `${phase} finished (demo).`);
    mockStep = null;
    if (phase === "synthesizing") {
      finishMock(task);
      return;
    }
    task.agent_results[assignment.agent] = { response, provider: "simulated", model: null, phase };
    if (phase !== "revising")
      task.initial_results[assignment.agent] = { ...task.agent_results[assignment.agent]! };
    // Bounded illustrative review requests; these are explicitly labelled demo findings.
    if (phase === "reviewing") {
      const target = assignment.agent === "security" ? "backend" : "frontend";
      if (
        assignment.depends_on.includes(target) &&
        task.plan.some((a) => a.agent === target && a.kind === "specialist")
      ) {
        mockRevisions.add(target);
        mockEvent(
          task,
          assignment.agent,
          "revision_request",
          target === "backend"
            ? "Demo correction: specify secure cookie token handling."
            : "Demo correction: align frontend field names with the backend contract.",
          target,
        );
      }
    }
  }
  const next = task.plan.find(
    (a) => a.state === "waiting" && a.depends_on.every((id) => task.agent_results[id]),
  );
  if (next) {
    task.status = "working";
    startMockStep(task, next, next.kind === "review" ? "reviewing" : "working");
    return;
  }
  const revision = task.plan.find((a) => mockRevisions.has(a.agent) && a.revisions === 0);
  if (revision) {
    revision.revisions = 1;
    startMockStep(task, revision, "revising");
    return;
  }
  if (task.plan.length === 1) {
    finishMock(task);
    return;
  }
  task.status = "synthesizing";
  startMockStep(
    task,
    task.plan.find((a) => a.agent === task.final_owner)!,
    "synthesizing",
  );
}

function mockSnapshot(): StatusResponse {
  tickMock();
  return structuredClone({ desks: mockDesks, assistant: mockAssistant, tasks: mockTasks });
}

function mockSubmit(task: string): StatusResponse {
  if (mockTasks.some((task) => !taskFinished(task)))
    throw new Error("An office task is already running. Wait for its final report.");
  const workspace = createDemoTask(task);
  mockTasks = [...mockTasks, workspace].slice(-20);
  mockRevisions.clear();
  mockStep = null;
  mockEvent(
    workspace,
    "coordinator",
    "plan",
    `Assigned ${workspace.plan.length} specialists; final owner: ${workspace.final_owner}.`,
  );
  for (const assignment of workspace.plan) {
    const desk = mockDesks.find((d) => d.id === assignment.agent)!;
    Object.assign(desk, {
      status: "waiting",
      current_task: assignment.subtask,
      task_id: workspace.id,
      activity: `Waiting for ${assignment.depends_on.join(", ") || "coordinator"}`,
      output: [],
      answered_by: null,
      model: null,
    });
  }
  mockAssistant = { state: "dispatching", route: workspace.plan.map((a) => a.agent) };
  return mockSnapshot();
}

/* --------------------------------- client -------------------------------- */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok)
    throw new Error(
      res.status === 409
        ? "An office task is already running. Wait for its final report."
        : "Backend request failed. Please try again.",
    );
  return (await res.json()) as T;
}

export const officeApi = {
  isMock: !BASE_URL,

  async sendPrivateMessage(
    deskId: string,
    message: string,
    history: MeetingMessage[],
    signal?: AbortSignal,
  ): Promise<MeetingResponse> {
    const recent = history.slice(-12).map((m) => ({ ...m, content: m.content.slice(0, 4000) }));
    if (!BASE_URL) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (signal?.aborted) throw new DOMException("Meeting ended", "AbortError");
      return {
        desk: deskId,
        provider: "simulated",
        model: null,
        response: `[Demo ${deskId} response] Your message: ${message}${recent.length ? `\nContinuing our conversation about: ${recent[0]!.content}` : ""}\nThis is a simulated conversation; no actions were executed.`,
      };
    }
    return request<MeetingResponse>(`/agents/${deskId}/message`, {
      method: "POST",
      body: JSON.stringify({ message, history: recent }),
      signal: signal ?? null,
    });
  },

  async getStatus(): Promise<StatusResponse> {
    if (!BASE_URL) return mockSnapshot();
    return request<StatusResponse>("/status");
  },

  async submitTask(task: string): Promise<StatusResponse> {
    if (!BASE_URL) return mockSubmit(task);
    return request<StatusResponse>("/task", { method: "POST", body: JSON.stringify({ task }) });
  },

  async setProvider(deskId: string, provider: string): Promise<StatusResponse> {
    if (!BASE_URL) {
      const d = mockDesks.find((x) => x.id === deskId);
      if (d) d.provider = provider;
      return mockSnapshot();
    }
    return request<StatusResponse>(`/desk/${deskId}/provider`, {
      method: "POST",
      body: JSON.stringify({ provider }),
    });
  },

  /** Called by the UI once the assistant has finished its walk-back animation. */
  async clearAssistant(): Promise<StatusResponse> {
    if (!BASE_URL) {
      if (mockTasks.some((task) => !taskFinished(task))) return mockSnapshot();
      mockAssistant = { state: "idle", route: [] };
      return mockSnapshot();
    }
    return request<StatusResponse>("/assistant/clear", { method: "POST" });
  },
};
