"""Offline integration checks: python -m unittest discover -s backend -v."""

import asyncio
import json
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx

import agents
import main


class OllamaTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.environment = patch.dict(os.environ, {
            "OLLAMA_BASE_URL": "http://localhost:11434",
            "OLLAMA_MODEL": "gpt-oss:20b",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.real_client = httpx.AsyncClient

    def mock_http(self, handler):
        return patch.object(agents.httpx, "AsyncClient", side_effect=lambda **kwargs:
            self.real_client(transport=httpx.MockTransport(handler), **kwargs))

    async def collect(self, desk: str) -> list[str]:
        return [line async for line in agents.run_agent(desk, "Provider A", "sample task")]

    async def test_all_local_desks_send_distinct_system_prompts(self) -> None:
        systems = []

        def respond(request: httpx.Request) -> httpx.Response:
            self.assertEqual(str(request.url), "http://localhost:11434/api/generate")
            self.assertEqual(request.method, "POST")
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], "gpt-oss:20b")
            self.assertEqual(payload["prompt"], "sample task")
            self.assertIs(payload["stream"], False)
            systems.append(payload["system"])
            return httpx.Response(200, json={"response": "Generated answer\nwith code", "done": True})

        with self.mock_http(respond):
            for desk in ("frontend", "security", "sql"):
                output = await self.collect(desk)
                self.assertIn("Generated answer\nwith code", output)
                self.assertIn("live local generation", "\n".join(output))
                self.assertNotIn("simulated", "\n".join(output))
                self.assertEqual(output[-1], "> task complete.")
        self.assertEqual(len(set(systems)), 3)
        for role, system in zip(("Frontend Engineer", "Security Engineer", "Database Engineer"), systems):
            self.assertIn(role, system)

    async def test_defaults_and_configuration(self) -> None:
        urls = []
        models = []

        def respond(request: httpx.Request) -> httpx.Response:
            urls.append(str(request.url))
            models.append(json.loads(request.content)["model"])
            return httpx.Response(200, json={"response": "ok"})

        with self.mock_http(respond):
            with patch.dict(os.environ, {}, clear=True):
                await agents.generate_ollama("task", "system")
            with patch.dict(os.environ, {"OLLAMA_BASE_URL": "http://localhost:12345/", "OLLAMA_MODEL": "custom"}):
                await agents.generate_ollama("task", "system")
        self.assertEqual(urls, ["http://localhost:11434/api/generate", "http://localhost:12345/api/generate"])
        self.assertEqual(models, ["gpt-oss:20b", "custom"])

    async def test_failures_fall_back_without_exposing_response_or_exception_text(self) -> None:
        failures = [
            httpx.ConnectError("SECRET"), httpx.ReadTimeout("SECRET"),
            httpx.Response(404, json={"error": "SECRET model missing"}),
            httpx.Response(500, text="SECRET server error"),
            httpx.Response(200, text="SECRET invalid json"),
            *[httpx.Response(200, json=body) for body in (
                [], {}, {"response": None}, {"response": 123}, {"response": " "},
                {"error": "SECRET", "response": "not a valid success"},
            )],
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                def respond(request: httpx.Request) -> httpx.Response:
                    if isinstance(failure, Exception):
                        raise failure
                    return failure

                with self.mock_http(respond), patch.object(agents.asyncio, "sleep", new=AsyncMock()), self.assertLogs("agents", level="WARNING") as logs:
                    output = await self.collect("security")
                self.assertIn("falling back to simulated output", "\n".join(output))
                self.assertIn("> executing step 3/3", output)
                self.assertEqual(output[-1], "> task complete.")
                self.assertNotIn("SECRET", "\n".join(output + logs.output))

    async def test_overall_timeout(self) -> None:
        async def respond(request: httpx.Request) -> httpx.Response:
            await asyncio.Event().wait()
            return httpx.Response(200, json={"response": "unreachable"})

        with self.mock_http(respond), patch.object(agents, "OLLAMA_TIMEOUT_SECONDS", 0.01), patch.object(agents.asyncio, "sleep", new=AsyncMock()), self.assertLogs("agents", level="WARNING"):
            output = await self.collect("frontend")
        self.assertIn("request timed out", "\n".join(output))
        self.assertEqual(output[-1], "> task complete.")

    async def test_background_status_and_failure_isolation(self) -> None:
        async def respond(request: httpx.Request) -> httpx.Response:
            if "Security Engineer" in json.loads(request.content)["system"]:
                return httpx.Response(503, text="unavailable")
            return httpx.Response(200, json={"response": "real generated text"})

        with self.mock_http(respond), patch.object(agents.asyncio, "sleep", new=AsyncMock()), self.assertLogs("agents", level="WARNING"):
            initial = await main.post_task(main.TaskRequest(task="frontend security sql"))
            self.assertEqual(initial.assistant.route, ["frontend", "security", "sql"])
            self.assertEqual(initial.assistant.state, "dispatching")
            pending = [task for task in asyncio.all_tasks() if task.get_coro().__name__ == "work_desk"]
            await asyncio.gather(*pending)
        result = await main.get_status()
        self.assertEqual(result.assistant.state, "returning")
        for desk in result.desks:
            if desk.id in ("frontend", "security", "sql"):
                self.assertEqual(desk.status, "done")
                self.assertEqual("real generated text" in desk.output, desk.id != "security")
        await main.post_assistant_clear()
        self.assertEqual(main.assistant.state, "idle")

    async def test_hosted_desks_keep_their_existing_handlers(self) -> None:
        for desk, handler in {
            "backend": agents._run_backend_nemotron,
            "research": agents._run_research_groq,
            "debugger": agents._run_debugger_groq,
        }.items():
            self.assertIs(agents.DESK_HANDLERS[desk], handler)


if __name__ == "__main__":
    unittest.main()
