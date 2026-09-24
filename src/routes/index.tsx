import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DESK_META } from "@/lib/office-api";
import { OfficeFloor } from "@/components/office/OfficeFloor";
import { Minimap } from "@/components/office/Minimap";
import { TerminalPanel } from "@/components/office/TerminalPanel";
import { AgentCards } from "@/components/office/AgentCards";
import { ChatPanel } from "@/components/office/ChatPanel";
import { PrivateMeetingDialog } from "@/components/office/PrivateMeetingDialog";
import { DeskDialog } from "@/components/office/DeskDialog";
import { useOfficeScene } from "@/hooks/useOfficeScene";
import type { DeskId } from "@/lib/office-scene";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Office — Isometric Multi-Agent Dashboard" },
      {
        name: "description",
        content:
          "Dispatch orders to six specialist AI agents in a pixel-art isometric office. Specialist handoffs, bounded reviews, and coordinated final reports.",
      },
      { property: "og:title", content: "AI Office — Isometric Multi-Agent Dashboard" },
      {
        property: "og:description",
        content:
          "Run a pixel-art isometric office of six AI agents: backend, research, frontend, debugger, security and SQL.",
      },
    ],
  }),
  component: OfficePage,
});

function OfficePage() {
  const {
    status,
    agents,
    assistant,
    chat,
    terminal,
    dispatch,
    dispatchError,
    officeBusy,
    talkPrivately,
    meetingAgent,
    endMeeting,
    changeProvider,
    isMock,
  } = useOfficeScene();
  const [openDesk, setOpenDesk] = useState<string | null>(null);

  const working = agents.filter((a) => a.status === "working").length;
  const desks = status?.desks ?? [];
  const selected = desks.find((d) => d.id === openDesk);
  const selectedColor = DESK_META.find((m) => m.id === openDesk)?.color ?? "var(--foreground)";

  return (
    <main className="flex h-screen flex-col gap-2 overflow-hidden p-2 lg:flex-row lg:p-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="pixel-font text-[13px] text-primary">AI OFFICE</h1>
            <span className="text-[16px] text-muted-foreground">
              You are the Head — six desks, one dispatch queue.
            </span>
          </div>
          <span className="pixel-font text-[7px] text-muted-foreground">
            {working > 0 ? `${working} DESK${working > 1 ? "S" : ""} WORKING` : "FLOOR QUIET"}
          </span>
        </header>

        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="relative min-h-[320px] flex-[4]">
            <OfficeFloor agents={agents} assistant={assistant} onSelectDesk={setOpenDesk} />
            <div className="absolute right-3 top-3">
              <Minimap agents={agents} />
            </div>
          </div>
          <div className="min-h-[150px] flex-[1]">
            <TerminalPanel lines={terminal} />
          </div>
        </section>

        <section className="shrink-0">
          <AgentCards
            agents={agents}
            onTalk={talkPrivately as (id: DeskId) => void}
            onOpenDetail={(id) => setOpenDesk(id)}
          />
        </section>
      </div>

      <div className="w-full shrink-0 lg:h-full lg:w-[340px]">
        <ChatPanel
          chat={chat}
          onDispatch={(text) => void dispatch(text)}
          isMock={isMock}
          busy={officeBusy}
          error={dispatchError}
        />
      </div>

      {meetingAgent && (
        <PrivateMeetingDialog
          key={meetingAgent}
          agentId={meetingAgent}
          arriving={agents.find((a) => a.id === meetingAgent)?.status !== "meeting"}
          onClose={endMeeting}
        />
      )}

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
