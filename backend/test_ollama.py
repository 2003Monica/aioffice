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

                with self.mock_http(respond), patch.object(agents.asyncio, "sleep", new=AsyncMock()), self.assertLogs("uvicorn.error", level="WARNING") as logs:
                    output = await self.collect("security")
                self.assertIn("falling back to simulated output", "\n".join(output))
                self.assertIn("> simulating step 3/3", output)
                self.assertEqual(output[-1], "> task complete.")
                self.assertNotIn("SECRET", "\n".join(output + logs.output))

    async def test_overall_timeout(self) -> None:
        async def respond(request: httpx.Request) -> httpx.Response:
            await asyncio.Event().wait()
            return httpx.Response(200, json={"response": "unreachable"})

        with self.mock_http(respond), patch.object(agents, "OLLAMA_TIMEOUT_SECONDS", 0.01), patch.object(agents.asyncio, "sleep", new=AsyncMock()), self.assertLogs("uvicorn.error", level="WARNING"):
            output = await self.collect("frontend")
        self.assertIn("request timed out", "\n".join(output))
        self.assertEqual(output[-1], "> task complete.")

    async def test_background_status_and_failure_isolation(self) -> None:
        async def respond(request: httpx.Request) -> httpx.Response:
            if "Security Engineer" in json.loads(request.content)["system"]:
                return httpx.Response(503, text="unavailable")
            return httpx.Response(200, json={"response": "real generated text"})

        with self.mock_http(respond), patch.object(agents.asyncio, "sleep", new=AsyncMock()), self.assertLogs("uvicorn.error", level="WARNING"):
            initial = await main.post_task(main.TaskRequest(task="frontend security sql"))
            self.assertEqual(initial.assistant.route, ["sql", "frontend", "security", "debugger"])
            self.assertEqual(initial.assistant.state, "dispatching")
            await main.coordinator.worker
        result = await main.get_status()
        self.assertEqual(result.assistant.state, "returning")
        for desk in result.desks:
            if desk.id in ("frontend", "security", "sql"):
                self.assertEqual(desk.status, "done")
                self.assertEqual("real generated text" in desk.output, desk.id != "security")
        await main.post_assistant_clear()
        self.assertEqual(main.assistant.state, "idle")


    async def test_hosted_fallback_preserves_prompt_history_and_identity(self):
        async def broken(*args):
            yield "partial cloud output"
            raise httpx.ReadTimeout("SECRET")
        for desk in ("backend", "research", "debugger"):
            result = {}
            with patch.object(agents, "call_primary", broken), patch.object(agents, "generate_ollama", new=AsyncMock(return_value="local answer")) as local:
                output = [line async for line in agents.run_agent(desk, "Provider A", "original", context=[{"role": "user", "content": "previous"}], result=result)]
            self.assertEqual(result["provider"], "ollama")
            self.assertEqual(result["response"], "local answer")
            self.assertIn("original", local.call_args.args[0])
            self.assertIn("previous", local.call_args.args[0])
            self.assertIn(agents.SYSTEM_PROMPTS[desk], local.call_args.args[1])
            self.assertNotIn("SECRET", "".join(output))

    async def test_cloud_success_and_empty_answer(self):
        async def success(*args):
            yield "cloud answer"
        async def empty(*args):
            yield " "
        for desk in ("backend", "research", "debugger"):
            for handler, expected in ((success, "nvidia" if desk == "backend" else "groq"), (empty, "ollama")):
                result = {}
                with patch.object(agents, "call_primary", handler), patch.object(agents, "generate_ollama", new=AsyncMock(return_value="local")) as local:
                    _ = [line async for line in agents.run_agent(desk, "Provider A", "task", result=result)]
                self.assertEqual(result["provider"], expected)
                self.assertEqual(local.await_count, int(expected == "ollama"))

    async def test_meetings_direct_routing_context_and_validation(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            before = main.snapshot().model_dump()
            with patch.object(agents, "generate_ollama", new=AsyncMock(return_value="meeting answer")), patch.dict(os.environ, {"NVIDIA_API_KEY": "", "GROQ_API_KEY": ""}), patch.object(main.coordinator, "start", side_effect=AssertionError("router must not run")):
                for desk in agents.SYSTEM_PROMPTS:
                    response = await client.post(f"/agents/{desk}/message", json={"message": "api research frontend bug security sql", "history": [{"role": "user", "content": "prior"}]})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["desk"], desk)
                    self.assertEqual(response.json()["provider"], "ollama")
            self.assertEqual(main.snapshot().model_dump(), before)
            for body in ({"message": " "}, {"message": "x", "history": [{"role": "system", "content": "x"}]}, {"message": "x", "history": [{"role": "user", "content": "x"}] * 13}):
                self.assertEqual((await client.post("/agents/security/message", json=body)).status_code, 422)
            self.assertEqual((await client.post("/agents/unknown/message", json={"message": "x"})).status_code, 404)
            with patch.object(agents, "generate_ollama", new=AsyncMock(side_effect=ValueError())), patch.object(agents.asyncio, "sleep", new=AsyncMock()):
                response = await client.post("/agents/frontend/message", json={"message": "hello"})
                self.assertEqual(response.json()["provider"], "simulated")
            with patch.object(main, "run_agent", side_effect=RuntimeError("SECRET")):
                response = await client.post("/agents/frontend/message", json={"message": "hello"})
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("SECRET", response.text)

    async def test_primary_http_status_malformed_empty_and_success(self):
        real_openai = agents.AsyncOpenAI
        responses = [
            httpx.Response(401, json={"error": {"message": "SECRET"}}),
            httpx.Response(429, json={"error": {"message": "SECRET"}}),
            httpx.Response(503, json={"error": {"message": "SECRET"}}),
            httpx.Response(200, headers={"content-type": "text/event-stream"}, text="data: invalid-json\n\n"),
            httpx.Response(200, headers={"content-type": "text/event-stream"}, text="data: [DONE]\n\n"),
            httpx.Response(200, headers={"content-type": "text/event-stream"}, text='data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"cloud answer"},"finish_reason":null}]}\n\ndata: [DONE]\n\n'),
        ]
        for index, response in enumerate(responses):
            def client(**kwargs):
                return real_openai(http_client=self.real_client(transport=httpx.MockTransport(lambda request: response)), **kwargs)
            result = {}
            with patch.object(agents, "AsyncOpenAI", client), patch.dict(os.environ, {"GROQ_API_KEY": "test"}), patch.object(agents, "generate_ollama", new=AsyncMock(return_value="local answer")):
                output = [line async for line in agents.run_agent("research", "Provider A", "task", result=result)]
            self.assertEqual(result["provider"], "groq" if index == 5 else "ollama")
            self.assertNotIn("SECRET", "".join(output))

    def test_router_and_context_bounds(self):
        self.assertEqual(main.pick_desks("api research frontend debug security sql"), ["research", "sql", "backend", "frontend", "security", "debugger"])
        prompt = agents.build_prompt("original", [{"role": "user", "content": str(i) + "x" * 5000} for i in range(20)])
        self.assertLess(len(prompt), 49000)
        self.assertTrue(prompt.endswith("original"))


if __name__ == "__main__":
    unittest.main()
