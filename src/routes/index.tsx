import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { DESK_META, officeApi, type StatusResponse } from "@/lib/office-api";
import { Desk } from "@/components/office/Desk";
import { DeskDialog } from "@/components/office/DeskDialog";
import { StatusStrip } from "@/components/office/StatusStrip";
import { WorkerSprite } from "@/components/office/sprites";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Office — Retro Pixel Agent Dashboard" },
      {
        name: "description",
        content:
          "Command six AI agents from a 16-bit pixel-art office. Submit Head's Orders and watch the assistant dispatch tasks desk to desk.",
      },
      { property: "og:title", content: "AI Office — Retro Pixel Agent Dashboard" },
      {
        property: "og:description",
        content: "A retro 16-bit office where six AI agents work at desks, dispatched by a walking assistant.",
      },
    ],
  }),
  component: OfficePage,
});

/* fixed waypoints (percentages inside the office floor) */
const DESK_POS = [
  { x: 20, y: 36 },
  { x: 50, y: 36 },
  { x: 80, y: 36 },
  { x: 20, y: 72 },
  { x: 50, y: 72 },
  { x: 80, y: 72 },
];
const DOOR = { x: 50, y: 1 };
const DOOR_IDLE = { x: 50, y: 15 };
const STEP_MS = 1100;

function OfficePage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [order, setOrder] = useState("");
  const [openDesk, setOpenDesk] = useState<string | null>(null);
  const [pos, setPos] = useState(DOOR);
  const [visible, setVisible] = useState(false);
  const [log, setLog] = useState<string[]>(["> assistant standing by."]);
  const walking = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const poll = useCallback(async () => {
    try {
      setStatus(await officeApi.getStatus());
    } catch {
      /* backend offline — keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const runWalk = useCallback((route: string[]) => {
    walking.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const stops = [DOOR_IDLE, ...route.map((id) => {
      const i = DESK_META.findIndex((m) => m.id === id);
      const p = DESK_POS[i] ?? DOOR_IDLE;
      return { x: p.x, y: p.y + 14 };
    })];

    setVisible(true);
    setPos(DOOR);
    stops.forEach((stop, i) => {
      timers.current.push(
        setTimeout(() => {
          setPos(stop);
          if (i > 0) {
            const name = DESK_META.find((m) => m.id === route[i - 1])?.name;
            setLog((l) => [...l.slice(-4), `> subtask delivered to ${name}.`]);
          }
        }, i * STEP_MS + 50),
      );
    });
    timers.current.push(
      setTimeout(() => {
        setPos(DOOR_IDLE);
        setLog((l) => [...l.slice(-4), "> assistant idling by the door."]);
        walking.current = false;
      }, stops.length * STEP_MS + 50),
    );
  }, []);

  const walkHome = useCallback(() => {
    walking.current = true;
    setPos(DOOR);
    setLog((l) => [...l.slice(-4), "> all desks reported done. reporting to manager."]);
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        walking.current = false;
        void officeApi.clearAssistant();
      }, STEP_MS),
    );
  }, []);

  /* react to assistant state coming from the backend */
  const lastState = useRef<string>("idle");
  useEffect(() => {
    if (!status) return;
    const { state, route } = status.assistant;
    if (state !== lastState.current) {
      lastState.current = state;
      if (state === "dispatching") runWalk(route);
      if (state === "returning") walkHome();
    }
  }, [status, runWalk, walkHome]);

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    const task = order.trim();
    if (!task) return;
    setLog((l) => [...l.slice(-4), `> new order: "${task}"`]);
    setOrder("");
    lastState.current = "idle";
    try {
      setStatus(await officeApi.submitTask(task));
    } catch {
      setLog((l) => [...l.slice(-4), "> ERROR: backend unreachable."]);
    }
  }

  async function changeProvider(deskId: string, provider: string) {
    setStatus(await officeApi.setProvider(deskId, provider));
  }

  const desks = status?.desks ?? [];
  const selected = desks.find((d) => d.id === openDesk);
  const selectedColor = DESK_META.find((m) => m.id === openDesk)?.color ?? "var(--foreground)";

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="pixel-panel p-5">
          <h1 className="text-[16px] leading-tight text-primary">AI OFFICE</h1>
          <p className="mt-2 text-[8px] leading-relaxed text-muted-foreground">
            SIX AGENTS. ONE ASSISTANT. {officeApi.isMock ? "MOCK MODE" : "LIVE BACKEND"}
          </p>

          <form onSubmit={submitOrder} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="orders">
              Head's Orders
            </label>
            <input
              id="orders"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              placeholder="HEAD'S ORDERS..."
              className="pixel-input flex-1 text-[9px]"
            />
            <button type="submit" className="pixel-btn text-[9px]">
              Dispatch
            </button>
          </form>
        </header>

        <StatusStrip desks={desks} onSelect={setOpenDesk} />

        {/* ---------------------------- office scene --------------------------- */}
        <section
          className="floor-tiles relative h-[520px] w-full overflow-hidden"
          style={{ border: "8px solid var(--panel-border)" }}
          aria-label="Office floor"
        >
          {/* back wall */}
          <div className="absolute inset-x-0 top-0 h-[9%]" style={{ background: "var(--wall)" }}>
            <div className="absolute inset-x-0 bottom-0 h-[6px]" style={{ background: "var(--panel-border)" }} />
          </div>

          {/* manager's door */}
          <div className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 flex-col items-center">
            <div
              className="relative h-[44px] w-[64px]"
              style={{ background: "var(--wood-dark)", border: "4px solid var(--panel-border)" }}
            >
              <span
                className="absolute right-[6px] top-1/2 h-[6px] w-[6px] -translate-y-1/2"
                style={{ background: "var(--primary)" }}
              />
            </div>
            <div className="pixel-box mt-1 px-2 py-1 text-[7px] text-primary">MANAGER'S OFFICE</div>
          </div>

          {/* windows on the back wall */}
          {[10, 24, 76, 90].map((x) => (
            <div
              key={x}
              className="absolute top-[8px] h-[30px] w-[46px] -translate-x-1/2"
              style={{ left: `${x}%`, background: "oklch(0.55 0.09 210)", border: "4px solid var(--panel-border)" }}
            />
          ))}

          {/* desks */}
          {DESK_META.map((meta, i) => {
            const desk = desks.find((d) => d.id === meta.id);
            const p = DESK_POS[i]!;
            if (!desk) return null;
            return (
              <Desk
                key={meta.id}
                desk={desk}
                color={meta.color}
                x={p.x}
                y={p.y}
                onClick={() => setOpenDesk(meta.id)}
              />
            );
          })}

          {/* assistant */}
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all ease-linear"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transitionDuration: `${STEP_MS}ms`,
              opacity: visible ? 1 : 0,
            }}
          >
            <WorkerSprite
              shirt="oklch(0.72 0.17 55)"
              hair="oklch(0.2 0.03 40)"
              clipboard
              className="bob"
            />
          </div>
        </section>

        {/* assistant log */}
        <div
          className="scanlines relative p-3 text-[8px] leading-relaxed"
          style={{
            background: "var(--terminal-bg)",
            color: "var(--terminal-text)",
            border: "4px solid var(--panel-border)",
          }}
        >
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>

      {selected && (
        <DeskDialog
          desk={selected}
          color={selectedColor}
          onClose={() => setOpenDesk(null)}
          onProviderChange={(p) => void changeProvider(selected.id, p)}
        />
      )}
    </main>
  );
}
