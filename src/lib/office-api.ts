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
 */

export type DeskStatus = "idle" | "working" | "done";
export type AssistantState = "idle" | "dispatching" | "returning";

export interface Desk {
  id: string;
  name: string;
  status: DeskStatus;
  current_task: string | null;
  output: string[];
  provider: string;
}

export interface Assistant {
  state: AssistantState;
  /** Ordered desk ids the assistant should visit for the active dispatch. */
  route: string[];
}

export interface StatusResponse {
  desks: Desk[];
  assistant: Assistant;
}

export const PROVIDERS = ["Provider A", "Provider B", "Provider C"] as const;

export const DESK_META: {
  id: string;
  name: string;
  color: string;
  keywords: string[];
}[] = [
  { id: "backend", name: "BACKEND", color: "var(--desk-backend)", keywords: ["api", "server", "backend", "endpoint"] },
  { id: "research", name: "RESEARCH", color: "var(--desk-research)", keywords: ["research", "compare", "find", "study"] },
  { id: "frontend", name: "FRONTEND", color: "var(--desk-frontend)", keywords: ["ui", "frontend", "page", "design"] },
  { id: "devops", name: "DEVOPS", color: "var(--desk-devops)", keywords: ["deploy", "ci", "docker", "devops"] },
  { id: "security", name: "SECURITY", color: "var(--desk-security)", keywords: ["auth", "security", "secret", "audit"] },
  { id: "sql", name: "SQL / DATABASE", color: "var(--desk-sql)", keywords: ["sql", "database", "table", "query", "schema"] },
];

const BASE_URL = import.meta.env["VITE_OFFICE_API_URL"] as string | undefined;

/* ------------------------------- mock store ------------------------------ */

interface MockDesk extends Desk {
  finishAt: number;
  lines: string[];
}

const mockDesks: MockDesk[] = DESK_META.map((d) => ({
  id: d.id,
  name: d.name,
  status: "idle",
  current_task: null,
  output: [],
  provider: PROVIDERS[0] as string,
  finishAt: 0,
  lines: [],
}));

let mockAssistant: Assistant = { state: "idle", route: [] };

function pickDesks(task: string): MockDesk[] {
  const t = task.toLowerCase();
  const matched = mockDesks.filter((d) => {
    const meta = DESK_META.find((m) => m.id === d.id)!;
    return meta.keywords.some((k) => t.includes(k));
  });
  if (matched.length) return matched.slice(0, 3);
  // fall back to two pseudo-random desks so every order dispatches someone
  const start = task.length % mockDesks.length;
  return [mockDesks[start]!, mockDesks[(start + 2) % mockDesks.length]!];
}

function tickMock() {
  const now = Date.now();
  for (const d of mockDesks) {
    if (d.status !== "working") continue;
    const total = d.lines.length;
    const revealed = Math.min(total, Math.max(1, Math.ceil(total * (1 - (d.finishAt - now) / 9000))));
    d.output = d.lines.slice(0, revealed);
    if (now >= d.finishAt) {
      d.status = "done";
      d.output = [...d.lines, "> task complete."];
    }
  }
  if (mockAssistant.state !== "idle") {
    const dispatched = mockAssistant.route;
    const allDone = dispatched.every((id) => mockDesks.find((d) => d.id === id)?.status === "done");
    if (allDone) mockAssistant = { state: "returning", route: dispatched };
  }
}

function mockSnapshot(): StatusResponse {
  tickMock();
  return {
    desks: mockDesks.map(({ finishAt: _f, lines: _l, ...rest }) => ({ ...rest, output: [...rest.output] })),
    assistant: { ...mockAssistant, route: [...mockAssistant.route] },
  };
}

function mockSubmit(task: string): StatusResponse {
  const targets = pickDesks(task);
  for (const d of targets) {
    d.status = "working";
    d.current_task = task;
    d.finishAt = Date.now() + 6000 + Math.random() * 3000;
    d.lines = [
      `> booting ${d.name.toLowerCase()} agent [${d.provider}]`,
      `> parsing order: "${task.slice(0, 48)}"`,
      "> drafting plan ...",
      "> executing step 1/3",
      "> executing step 2/3",
      "> executing step 3/3",
    ];
    d.output = [d.lines[0]!];
  }
  mockAssistant = { state: "dispatching", route: targets.map((d) => d.id) };
  return mockSnapshot();
}

/* --------------------------------- client -------------------------------- */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const officeApi = {
  isMock: !BASE_URL,

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
  clearAssistant() {
    if (!BASE_URL) mockAssistant = { state: "idle", route: [] };
  },
};
