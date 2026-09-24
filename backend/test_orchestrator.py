"""Offline behavioral checks for bounded office orchestration."""
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import main
import orchestrator as office

AUTH = "Design a secure React/FastAPI login system backed by PostgreSQL."


def coordinator():
    desks = {desk: SimpleNamespace(provider="Provider A", status="idle", output=[]) for desk in office.RULES["order"]}
    return office.OfficeCoordinator(desks, SimpleNamespace(state="idle", route=[]))


class CollaborationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.office = coordinator()
        self.calls = []

    async def fake(self, desk, provider, prompt, *, result, **kwargs):
        self.calls.append((desk, prompt))
        if "Return JSON only" in prompt and "REVIEW CORRECTIONS:" not in prompt:
            target = "backend" if desk == "security" else "frontend"
            text = json.dumps({"summary": f"{desk}: access_token vs token contract mismatch", "revision_requests": [{"agent": target, "issue": "Align field names to access_token"}]})
        elif "REVIEW CORRECTIONS:" in prompt:
            text = f"{desk} corrected access_token contract"
        else:
            text = f"{desk} contribution: access_token contract"
        result.update(response=text, provider="ollama", model="gpt-oss:20b")
        yield text

    async def run_task(self, task=AUTH, runner=None):
        with patch.object(office, "run_agent", runner or self.fake):
            workspace = self.office.start(task)
            await self.office.worker
        return workspace

    def test_relevant_selection_and_acyclic_plan(self):
        cases = {
            "Style this CSS button": ["frontend"],
            "Optimize this PostgreSQL query": ["sql", "debugger"],
            "Build a responsive dashboard connected to our FastAPI API": ["backend", "frontend", "debugger"],
            "Research approaches for storing embeddings securely": ["research", "sql", "security"],
            AUTH: ["sql", "backend", "frontend", "security", "debugger"],
            "What approach should we use for realtime updates?": ["research", "backend", "frontend", "debugger"],
            "Explain photosynthesis": ["research"],
        }
        for task, expected in cases.items():
            plan = office.create_workspace(task).plan
            self.assertEqual([a.agent for a in plan], expected)
            seen = set()
            for assignment in plan:
                self.assertTrue(set(assignment.depends_on) <= seen)
                seen.add(assignment.agent)
            self.assertLessEqual(len(plan), 6)

    async def test_single_specialist_no_extra_synthesis_call(self):
        workspace = await self.run_task("Style this CSS button")
        self.assertEqual([desk for desk, _ in self.calls], ["frontend"])
        self.assertEqual(workspace.status, "done")
        self.assertEqual(workspace.final_report, workspace.agent_results["frontend"].response)

    async def test_dependencies_context_reviews_revisions_and_synthesis(self):
        workspace = await self.run_task()
        self.assertEqual([desk for desk, _ in self.calls], ["sql", "backend", "frontend", "security", "debugger", "backend", "frontend", "backend"])
        prompts = [prompt for _, prompt in self.calls]
        self.assertEqual(len(set(prompts)), len(prompts))
        self.assertTrue(all(AUTH in prompt for prompt in prompts))
        self.assertIn("sql contribution", prompts[1])
        self.assertIn("backend contribution", prompts[2])
        self.assertNotIn("sql contribution", prompts[2])  # Relevant dependencies only.
        self.assertIn("frontend contribution", prompts[3])
        self.assertIn("field names", prompts[5])
        self.assertIn("backend corrected", prompts[-1])
        self.assertIn("frontend corrected", prompts[-1])
        self.assertIn("security:", prompts[-1])
        self.assertIn("debugger:", prompts[-1])
        self.assertEqual(workspace.status, "done")
        self.assertTrue(workspace.final_report)
        self.assertEqual(workspace.initial_results["backend"].phase, "working")
        self.assertEqual(workspace.agent_results["backend"].phase, "revising")
        self.assertTrue(any(m.sender == "sql" and m.recipient == "backend" and m.kind == "handoff" for m in workspace.messages))
        self.assertTrue(all(a.revisions <= 1 for a in workspace.plan))
        self.assertTrue(all(d.status == "done" for d in self.office.desks.values() if hasattr(d, "task_id")))
        self.assertEqual(self.office.assistant.state, "returning")

    def test_review_validation_blocks_loops_and_unassigned_targets(self):
        for payload in ("not json", {"summary": "x", "revision_requests": [{"agent": "unknown", "issue": "x"}]},
                        {"summary": "x", "revision_requests": [{"agent": "backend", "issue": "x"}] * 2},
                        {"summary": "x", "revision_requests": [{"agent": "security", "issue": "review again"}]}):
            with self.assertRaises(ValueError):
                office.parse_review(payload if isinstance(payload, str) else json.dumps(payload), {"backend"})

    async def test_two_reviewers_one_target_only_one_revision(self):
        async def runner(desk, provider, prompt, *, result, **kwargs):
            self.calls.append((desk, prompt))
            result.update(response=json.dumps({"summary": "review", "revision_requests": [{"agent": "backend", "issue": "correct contract"}]}), provider="ollama")
            yield "text"
        workspace = await self.run_task(runner=runner)
        self.assertEqual(next(a for a in workspace.plan if a.agent == "backend").revisions, 1)
        self.assertEqual(len(self.calls), 7)  # 5 initial + 1 revision + 1 synthesis.

    async def test_failure_isolation_and_compiled_report(self):
        async def runner(desk, provider, prompt, *, result, **kwargs):
            if desk == "backend":
                raise RuntimeError("SECRET")
            if desk in {"security", "debugger"}:
                result.update(response="Providers unavailable", provider="simulated")
            else:
                result.update(response=f"{desk} useful contribution", provider="ollama")
            yield "text"
        workspace = await self.run_task(runner=runner)
        self.assertEqual(workspace.status, "partial")
        self.assertIn("sql useful contribution", workspace.final_report)
        self.assertIn("frontend useful contribution", workspace.final_report)
        self.assertNotIn("SECRET", workspace.model_dump_json())
        self.assertEqual(len(workspace.agent_results), 5)

    async def test_timeout_and_cancellation_release_desks(self):
        async def never(*args, **kwargs):
            await asyncio.Event().wait()
            yield "unreachable"
        with patch.object(office, "TASK_TIMEOUT_SECONDS", 0.01):
            workspace = await self.run_task(runner=never)
        self.assertEqual(workspace.status, "timed_out")
        self.assertTrue(workspace.final_report)
        self.assertFalse(self.office.busy)
        with patch.object(office, "run_agent", never):
            workspace = self.office.start(AUTH)
            await asyncio.sleep(0)
            self.office.worker.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await self.office.worker
        self.assertEqual(workspace.status, "failed")
        self.assertEqual(self.office.assistant.state, "returning")

    async def test_all_simulated_skips_unnecessary_synthesis(self):
        async def simulated(desk, provider, prompt, *, result, **kwargs):
            self.calls.append((desk, prompt))
            result.update(response="simulation", provider="simulated")
            yield "simulation"
        workspace = await self.run_task(runner=simulated)
        self.assertEqual(len(self.calls), len(workspace.plan))
        self.assertEqual(workspace.status, "partial")
        self.assertIn("No specialist findings", workspace.final_report)
        self.assertTrue(all(a.revisions == 0 for a in workspace.plan))

    async def test_failed_revision_keeps_original_and_flags_correction(self):
        async def runner(desk, provider, prompt, *, result, **kwargs):
            if "YOUR PREVIOUS CONTRIBUTION:" in prompt:
                result.update(response="simulation", provider="simulated")
                yield "simulation"
            else:
                async for line in self.fake(desk, provider, prompt, result=result, **kwargs):
                    yield line
        workspace = await self.run_task(runner=runner)
        self.assertEqual(workspace.agent_results["backend"].phase, "working")
        self.assertIn("backend contribution", workspace.agent_results["backend"].response)
        self.assertTrue(any("corrections unresolved" in warning for warning in workspace.warnings))
        self.assertEqual(workspace.status, "partial")

    async def test_history_bounded_and_unique(self):
        for _ in range(22):
            await self.run_task("Style CSS button")
        self.assertEqual(len(self.office.tasks), 20)
        self.assertEqual(len({task.id for task in self.office.tasks}), 20)

    async def test_api_rejects_overlapping_tasks_and_empty_input(self):
        async def never(*args, **kwargs):
            await asyncio.Event().wait()
            yield "unreachable"
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            with patch.object(main, "coordinator", self.office), patch.object(office, "run_agent", never):
                first = await client.post("/task", json={"task": AUTH})
                self.assertEqual(first.status_code, 200)
                self.assertEqual(len(first.json()["tasks"]), 1)
                second = await client.post("/task", json={"task": "CSS button"})
                self.assertEqual(second.status_code, 409)
                self.assertEqual(len(self.office.tasks), 1)
                self.assertEqual((await client.post("/task", json={"task": " "})).status_code, 422)
                await asyncio.sleep(0)
                self.office.worker.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await self.office.worker

    def test_context_is_bounded_and_marked(self):
        workspace = office.create_workspace(AUTH)
        workspace.agent_results["sql"] = office.Contribution(response="x" * 20000, provider="ollama")
        context = office.context_for(workspace, ["sql"])
        self.assertLess(len(context), 4100)
        self.assertIn("truncated", context)


if __name__ == "__main__":
    unittest.main()
