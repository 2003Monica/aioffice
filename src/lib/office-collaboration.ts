import rules from "../../shared/office-workflow.json";

export type WorkflowPhase =
  "waiting" | "working" | "reviewing" | "revising" | "synthesizing" | "done" | "skipped";
export interface Assignment {
  agent: string;
  subtask: string;
  depends_on: string[];
  kind: "specialist" | "review";
  state: WorkflowPhase;
  revisions: number;
}
export interface Contribution {
  response: string;
  provider: string;
  model: string | null;
  phase: string;
}
export interface Activity {
  id: number;
  ts: number;
  sender: string;
  recipient: string | null;
  kind: string;
  text: string;
}
export interface OfficeTask {
  id: string;
  original_task: string;
  plan: Assignment[];
  final_owner: string;
  status: "planned" | "working" | "synthesizing" | "done" | "partial" | "timed_out" | "failed";
  created_at: number;
  finished_at: number | null;
  agent_results: Record<string, Contribution>;
  initial_results: Record<string, Contribution>;
  messages: Activity[];
  warnings: string[];
  final_report: string | null;
  synthesis_provider: string | null;
}

export const taskFinished = (task: OfficeTask) =>
  ["done", "partial", "timed_out", "failed"].includes(task.status);
export const deskReserved = (status: string) =>
  ["waiting", "working", "reviewing", "revising", "synthesizing"].includes(status);

function matches(text: string, words: string[]): boolean {
  return words.some((word) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text),
  );
}

/** Demo uses the same vocabulary, assignments and dependency rules as the backend. */
export function createDemoTask(task: string): OfficeTask {
  const text = task.toLowerCase();
  const selected = new Set(
    Object.entries(rules.keywords)
      .filter(([, words]) => matches(text, words))
      .map(([desk]) => desk),
  );
  if (matches(text, ["realtime", "real-time", "websockets", "sse", "polling"])) {
    ["research", "backend", "frontend"].forEach((desk) => selected.add(desk));
  }
  if (!selected.size) selected.add("research");
  const technical = ["sql", "backend", "frontend"].filter((desk) => selected.has(desk));
  if (
    technical.length >= 2 ||
    (selected.has("sql") && matches(text, ["optimize", "optimization", "slow", "performance"]))
  )
    selected.add("debugger");
  if (
    technical.length &&
    selected.has("backend") &&
    matches(text, ["architecture", "system", "application"])
  )
    selected.add("security");
  const plan: Assignment[] = [];
  for (const desk of rules.order) {
    if (!selected.has(desk)) continue;
    const prior = plan.map((assignment) => assignment.agent);
    const review = desk in rules.reviews && prior.length > 0;
    const depends = review
      ? prior
      : prior.filter(
          (id) =>
            id === "research" ||
            (desk === "backend" && id === "sql") ||
            (desk === "frontend" && id === "backend"),
        );
    let subtask = review
      ? rules.reviews[desk as keyof typeof rules.reviews]
      : rules.assignments[desk as keyof typeof rules.assignments];
    if (desk === "sql" && matches(text, ["query", "queries"]))
      subtask =
        "Analyze the supplied PostgreSQL query, suggest an optimized query and indexes, and explain expected tradeoffs. State missing query/plan information; suggested SQL is not executed.";
    if (desk === "backend" && matches(text, ["auth", "authentication", "login"]))
      subtask =
        "Design authentication endpoints, exact request/response fields, token/session lifecycle and validation using the supplied schema. Specify the frontend contract.";
    plan.push({
      agent: desk,
      subtask,
      depends_on: depends,
      kind: review ? "review" : "specialist",
      state: "waiting",
      revisions: 0,
    });
  }
  const owner =
    matches(text, ["research", "compare", "what approach", "approaches"]) &&
    selected.has("research")
      ? "research"
      : selected.has("frontend") &&
          matches(text, ["dashboard", "ui", "responsive", "component", "layout"])
        ? "frontend"
        : ["backend", "frontend", "sql", "research", "security", "debugger"].find((desk) =>
            selected.has(desk),
          )!;
  return {
    id: crypto.randomUUID(),
    original_task: task,
    plan,
    final_owner: owner,
    status: "planned",
    created_at: Date.now() / 1000,
    finished_at: null,
    agent_results: {},
    initial_results: {},
    messages: [],
    warnings: [
      "Demo collaboration: all contributions and review findings are simulated; no actions were executed.",
    ],
    final_report: null,
    synthesis_provider: null,
  };
}
