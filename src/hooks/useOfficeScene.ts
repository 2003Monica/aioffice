import { useCallback, useEffect, useRef, useState } from "react";
import { DESK_META, officeApi, type DeskStatus, type StatusResponse } from "@/lib/office-api";
import {
  ASSISTANT_HOME,
  BANTER,
  COFFEE_DOOR,
  COFFEE_SPOTS,
  CORRIDOR_Y,
  DESK_VISUALS,
  MANAGER_DOOR,
  MEETING_SPOTS,
  dist,
  type AgentVisual,
  type AgentVisualStatus,
  type ChatEntry,
  type DeskId,
  type TerminalLine,
  type Vec,
} from "@/lib/office-scene";

/**
 * Cosmetic client-side animation layer. All real state (desk status,
 * output, provider, task routing) comes from polling `officeApi.getStatus()`
 * -- the exact same call the old index.tsx made -- and every action
 * (`dispatch`, `changeProvider`) calls the exact same `officeApi` methods
 * as before. This hook only adds purely-visual position/caffeine/banter
 * state on top of that real data; it never invents its own routing or
 * streaming.
 */

type Step =
  | { t: "move"; to: Vec }
  | { t: "wait"; ms: number }
  | { t: "state"; status: AgentVisualStatus; banter?: string | null };

type Walker = {
  pos: Vec;
  from: Vec;
  status: AgentVisualStatus;
  script: Step[];
  stepStart: number;
  stepDur: number;
  banter: string | null;
  caffeine: number;
  nextWander: number;
};

const SPEED = 2.6; // tiles per second
const POLL_MS = 1500; // matches the original polling cadence

/** Route through the corridor so nobody walks through walls. */
function pathTo(from: Vec, to: Vec): Step[] {
  const steps: Step[] = [];
  const isRoom = (p: Vec) => p.y > CORRIDOR_Y + 0.4;
  if (isRoom(to) && !isRoom(from)) {
    const door = to.x < 6 ? COFFEE_DOOR : MANAGER_DOOR;
    steps.push({ t: "move", to: { x: door.x, y: CORRIDOR_Y } }, { t: "move", to: door });
  } else if (isRoom(from) && !isRoom(to)) {
    const door = from.x < 6 ? COFFEE_DOOR : MANAGER_DOOR;
    steps.push({ t: "move", to: door }, { t: "move", to: { x: door.x, y: CORRIDOR_Y } });
  } else if (!isRoom(from) && !isRoom(to) && Math.abs(from.x - to.x) > 1.2) {
    steps.push({ t: "move", to: { x: from.x, y: Math.min(CORRIDOR_Y, Math.max(from.y, to.y)) } });
  }
  steps.push({ t: "move", to });
  return steps;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const DESK_IDS = DESK_META.map((m) => m.id as DeskId);

function initialWalkers(): Record<DeskId, Walker> {
  const entries = {} as Record<DeskId, Walker>;
  for (const id of DESK_IDS) {
    entries[id] = {
      pos: { ...DESK_VISUALS[id].seat },
      from: { ...DESK_VISUALS[id].seat },
      status: "idle",
      script: [],
      stepStart: 0,
      stepDur: 0,
      banter: null,
      caffeine: 55 + Math.random() * 45,
      nextWander: Date.now() + 6000 + Math.random() * 20000,
    };
  }
  return entries;
}

export function useOfficeScene() {
  const walkers = useRef<Record<DeskId, Walker>>(initialWalkers());
  const assistantWalker = useRef<Walker>({
    pos: { ...ASSISTANT_HOME },
    from: { ...ASSISTANT_HOME },
    status: "idle",
    script: [],
    stepStart: 0,
    stepDur: 0,
    banter: null,
    caffeine: 100,
    nextWander: Infinity,
  });

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [agents, setAgents] = useState<AgentVisual[]>([]);
  const [assistantVisual, setAssistantVisual] = useState<{ pos: Vec; status: AgentVisualStatus }>({
    pos: ASSISTANT_HOME,
    status: "idle",
  });
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [terminal, setTerminal] = useState<TerminalLine[]>([
    { id: uid(), deskId: "system", text: "AI OFFICE terminal — awaiting orders." },
    {
      id: uid(),
      deskId: "system",
      text: `link: ${officeApi.isMock ? "local simulation (mock mode)" : "remote backend (live)"}`,
    },
  ]);

  const seenOutputLen = useRef<Record<string, number>>({});
  const prevDeskStatus = useRef<Record<string, DeskStatus>>({});
  const lastAssistantState = useRef<string>("idle");
  const busyDesks = useRef<Set<DeskId>>(new Set());

  const setScript = useCallback((w: Walker, steps: Step[]) => {
    w.script = steps;
    w.stepStart = 0;
    w.stepDur = 0;
  }, []);

  const pushTerminal = useCallback((deskId: DeskId | "system", text: string) => {
    setTerminal((prev) => [...prev.slice(-200), { id: uid(), deskId, text }]);
  }, []);

  /* -------------------------------------------------------- real polling */
  const poll = useCallback(async () => {
    let next: StatusResponse;
    try {
      next = await officeApi.getStatus();
    } catch {
      return; // backend offline -- keep last snapshot
    }
    setStatus(next);

    for (const desk of next.desks) {
      const id = desk.id as DeskId;
      const w = walkers.current[id];
      if (!w) continue;

      // stream new output lines into the terminal (append-only diff)
      const seen = seenOutputLen.current[id] ?? 0;
      if (desk.output.length > seen) {
        for (const line of desk.output.slice(seen)) pushTerminal(id, line);
        seenOutputLen.current[id] = desk.output.length;
      }

      const prev = prevDeskStatus.current[id];
      if (prev !== desk.status) {
        if (desk.status === "working") {
          // interrupt: a real dispatched task always wins over idle wandering
          busyDesks.current.add(id);
          w.banter = null;
          setScript(w, [
            { t: "state", status: "walking", banter: null },
            ...pathTo(w.pos, DESK_VISUALS[id].seat),
            { t: "state", status: "working" },
          ]);
        } else if (desk.status === "done" && prev === "working") {
          busyDesks.current.delete(id);
          setScript(w, [
            { t: "state", status: "done" },
            { t: "wait", ms: 4000 },
            { t: "state", status: "idle" },
          ]);
          w.nextWander = Date.now() + 8000 + Math.random() * 15000;
        } else if (desk.status === "idle") {
          busyDesks.current.delete(id);
        }
        prevDeskStatus.current[id] = desk.status;
      }
    }

    // chat resolution: mark orders resolved once every desk in their route is done
    setChat((prevChat) =>
      prevChat.map((c) =>
        !c.resolved &&
        c.deskIds.every((id) => next.desks.find((d) => d.id === id)?.status === "done")
          ? { ...c, resolved: true }
          : c,
      ),
    );

    // assistant courier animation follows the same state transitions the old UI used
    const { state, route } = next.assistant;
    if (state !== lastAssistantState.current) {
      lastAssistantState.current = state;
      if (state === "dispatching") {
        const a = assistantWalker.current;
        const stops = route
          .map((id) => DESK_VISUALS[id as DeskId]?.seat)
          .filter((v): v is Vec => !!v);
        const steps: Step[] = [{ t: "state", status: "walking" }];
        let from = a.pos;
        for (const stop of stops) {
          steps.push(...pathTo(from, { x: stop.x + 0.9, y: stop.y }), { t: "wait", ms: 500 });
          from = { x: stop.x + 0.9, y: stop.y };
        }
        steps.push(...pathTo(from, ASSISTANT_HOME), { t: "state", status: "idle" });
        setScript(a, steps);
      } else if (state === "returning") {
        const a = assistantWalker.current;
        setScript(a, [
          { t: "state", status: "walking" },
          ...pathTo(a.pos, ASSISTANT_HOME),
          { t: "state", status: "idle" },
        ]);
        pushTerminal("system", "all desks reported. order closed.");
        void officeApi.clearAssistant();
      }
    }
  }, [pushTerminal, setScript]);

  useEffect(() => {
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  /* ------------------------------------------------------------ main tick */
  useEffect(() => {
    let raf = 0;

    const loop = () => {
      const t = Date.now();
      const all: Walker[] = [...DESK_IDS.map((id) => walkers.current[id]), assistantWalker.current];

      for (const w of all) {
        const isAssistant = w === assistantWalker.current;

        // caffeine economy (assistant runs on caffeine already at 100)
        if (!isAssistant) {
          if (w.status === "coffee") w.caffeine = Math.min(100, w.caffeine + 0.45);
          else w.caffeine = Math.max(0, w.caffeine - (w.status === "working" ? 0.035 : 0.015));
        }

        // idle wandering to the coffee room (never while a real task is running)
        const deskId = isAssistant
          ? null
          : (DESK_IDS.find((id) => walkers.current[id] === w) ?? null);
        if (
          deskId &&
          !busyDesks.current.has(deskId) &&
          w.status === "idle" &&
          w.script.length === 0 &&
          t > w.nextWander
        ) {
          const spot = COFFEE_SPOTS[Math.floor(Math.random() * COFFEE_SPOTS.length)]!;
          const seat = DESK_VISUALS[deskId].seat;
          w.nextWander = t + 20000 + Math.random() * 20000;
          setScript(w, [
            { t: "state", status: "walking" },
            ...pathTo(w.pos, spot),
            {
              t: "state",
              status: "coffee",
              banter: BANTER[Math.floor(Math.random() * BANTER.length)]!,
            },
            { t: "wait", ms: 5200 + Math.random() * 3000 },
            { t: "state", status: "walking", banter: null },
            ...pathTo(spot, seat),
            { t: "state", status: "idle" },
          ]);
        }

        // execute script
        const step = w.script[0];
        if (!step) continue;
        if (w.stepStart === 0) {
          w.stepStart = t;
          if (step.t === "move") {
            w.from = { ...w.pos };
            w.stepDur = Math.max(120, (dist(w.pos, step.to) / SPEED) * 1000);
          } else if (step.t === "wait") {
            w.stepDur = step.ms;
          } else {
            w.stepDur = 0;
          }
        }
        if (step.t === "state") {
          w.status = step.status;
          if (step.banter !== undefined) w.banter = step.banter;
          w.script.shift();
          w.stepStart = 0;
          continue;
        }
        const p = w.stepDur === 0 ? 1 : Math.min(1, (t - w.stepStart) / w.stepDur);
        if (step.t === "move") {
          w.pos = {
            x: w.from.x + (step.to.x - w.from.x) * p,
            y: w.from.y + (step.to.y - w.from.y) * p,
          };
        }
        if (p >= 1) {
          w.script.shift();
          w.stepStart = 0;
        }
      }

      setAgents(
        DESK_IDS.map((id) => {
          const w = walkers.current[id];
          const desk = status?.desks.find((d) => d.id === id);
          return {
            id,
            pos: { ...w.pos },
            status: w.status,
            banter: w.banter,
            caffeine: w.caffeine,
            provider: desk?.provider ?? "Provider A",
            busy: busyDesks.current.has(id),
          };
        }),
      );
      const a = assistantWalker.current;
      setAssistantVisual({ pos: { ...a.pos }, status: a.status });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [setScript, status]);

  /* -------------------------------------------------------------- actions */

  const dispatch = useCallback(
    async (task: string) => {
      const text = task.trim();
      if (!text) return;
      pushTerminal("system", `> new order: "${text}"`);
      lastAssistantState.current = "idle"; // force the dispatching transition to fire even if a route repeats
      try {
        const next = await officeApi.submitTask(text);
        setStatus(next);
        const deskIds = next.assistant.route as DeskId[];
        setChat((prev) => [
          ...prev,
          { id: uid(), order: text, deskIds, resolved: false, ts: Date.now() },
        ]);
        pushTerminal(
          "system",
          `> dispatch → ${deskIds.map((id) => DESK_META.find((m) => m.id === id)?.name ?? id).join(", ")}`,
        );
      } catch {
        pushTerminal("system", "ERROR: backend unreachable.");
      }
    },
    [pushTerminal],
  );

  const talkPrivately = useCallback(
    (id: DeskId) => {
      const w = walkers.current[id];
      if (!w || busyDesks.current.has(id) || w.status === "meeting") return;
      const spot = MEETING_SPOTS[Math.floor(Math.random() * MEETING_SPOTS.length)]!;
      setScript(w, [
        { t: "state", status: "walking", banter: null },
        ...pathTo(w.pos, spot),
        { t: "state", status: "meeting", banter: "…in a meeting" },
        { t: "wait", ms: 6500 },
        { t: "state", status: "walking", banter: null },
        ...pathTo(spot, DESK_VISUALS[id].seat),
        { t: "state", status: "idle" },
      ]);
      w.nextWander = Date.now() + 25000;
    },
    [setScript],
  );

  const changeProvider = useCallback(async (deskId: string, provider: string) => {
    setStatus(await officeApi.setProvider(deskId, provider));
  }, []);

  return {
    status,
    agents,
    assistant: assistantVisual,
    chat,
    terminal,
    dispatch,
    talkPrivately,
    changeProvider,
    isMock: officeApi.isMock,
  };
}
