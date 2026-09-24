import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Execute the actual demo API in Node; only Vite's environment and JSON import
// are substituted. No browser, HTTP services or generated test files are needed.
async function loadDemo() {
  const rules = await readFile(new URL("../shared/office-workflow.json", import.meta.url), "utf8");
  const planner = (
    await readFile(new URL("../src/lib/office-collaboration.ts", import.meta.url), "utf8")
  ).replace(/import rules from .*?;/, `const rules = ${rules};`);
  const compile = (source) =>
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
  const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const plannerUrl = url(compile(planner));
  const source = (await readFile(new URL("../src/lib/office-api.ts", import.meta.url), "utf8"))
    .replace('"./office-collaboration"', JSON.stringify(plannerUrl))
    .replace('import.meta.env["VITE_OFFICE_API_URL"]', "undefined");
  return (await import(url(compile(source) + `\n// isolated ${crypto.randomUUID()}`))).officeApi;
}

test("demo collaboration respects dependencies, reviews, revision limits and final history", async (t) => {
  const api = await loadDemo();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const initial = await api.submitTask(
    "Design a secure React/FastAPI login system backed by PostgreSQL.",
  );
  const task = initial.tasks[0];
  assert.deepEqual(
    task.plan.map((a) => a.agent),
    ["sql", "backend", "frontend", "security", "debugger"],
  );
  assert.equal(initial.desks.find((d) => d.id === "frontend").status, "waiting");
  await assert.rejects(api.submitTask("CSS button"), /already running/);
  let snapshot = initial;
  const phases = new Set();
  for (let i = 0; i < 15 && !snapshot.tasks[0].final_report; i++) {
    now += 3000;
    snapshot = await api.getStatus();
    for (const assignment of snapshot.tasks[0].plan) {
      phases.add(assignment.state);
      if (["working", "reviewing"].includes(assignment.state)) {
        for (const dependency of assignment.depends_on)
          assert.ok(snapshot.tasks[0].agent_results[dependency]);
      }
    }
  }
  const completed = snapshot.tasks[0];
  assert.ok(completed.final_report.includes("FINAL OFFICE REPORT"));
  assert.ok(completed.final_report.includes("Demo revision"));
  assert.equal(completed.status, "partial");
  assert.equal(snapshot.assistant.state, "returning");
  assert.ok(phases.has("reviewing") && phases.has("revising") && phases.has("synthesizing"));
  assert.ok(completed.plan.every((assignment) => assignment.revisions <= 1));
  assert.ok(completed.messages.some((m) => m.sender === "sql" && m.recipient === "backend"));
  assert.equal(snapshot.tasks.length, 1);
  const beforeMeeting = JSON.stringify(await api.getStatus());
  const response = await api.sendPrivateMessage("security", "Review React API SQL", []);
  assert.equal(response.desk, "security");
  assert.equal(JSON.stringify(await api.getStatus()), beforeMeeting);
  const next = await api.submitTask("Style this CSS button");
  assert.equal(next.tasks.length, 2);
  assert.notEqual(next.tasks[0].id, next.tasks[1].id);
  assert.equal(next.tasks[0].final_report, completed.final_report);
  assert.deepEqual(
    next.tasks[1].plan.map((a) => a.agent),
    ["frontend"],
  );
});

test("demo selection remains focused and each order terminates", async (t) => {
  const api = await loadDemo();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  for (const [prompt, expected] of [
    ["Style this CSS button", ["frontend"]],
    ["Optimize this PostgreSQL query", ["sql", "debugger"]],
    [
      "Build a responsive dashboard connected to our FastAPI API",
      ["backend", "frontend", "debugger"],
    ],
    ["Research approaches for storing embeddings securely", ["research", "sql", "security"]],
    [
      "What approach should we use for realtime updates?",
      ["research", "backend", "frontend", "debugger"],
    ],
  ]) {
    let snapshot = await api.submitTask(prompt);
    assert.deepEqual(
      snapshot.tasks.at(-1).plan.map((a) => a.agent),
      expected,
    );
    for (let i = 0; i < 15 && !snapshot.tasks.at(-1).final_report; i++) {
      now += 3000;
      snapshot = await api.getStatus();
    }
    assert.ok(snapshot.tasks.at(-1).final_report);
    await api.clearAssistant();
    assert.equal((await api.getStatus()).assistant.state, "idle");
  }
});
