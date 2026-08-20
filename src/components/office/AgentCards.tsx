import { DESK_META } from "@/lib/office-api";
import {
  DESK_VISUALS,
  type AgentVisual,
  type AgentVisualStatus,
  type DeskId,
} from "@/lib/office-scene";

const BADGE: Record<AgentVisualStatus, { label: string; color: string }> = {
  idle: { label: "IDLE", color: "var(--muted-foreground)" },
  walking: { label: "MOVING", color: "var(--muted-foreground)" },
  working: { label: "WORKING", color: "var(--state-working)" },
  done: { label: "DONE", color: "var(--state-done)" },
  coffee: { label: "COFFEE", color: "var(--wood-light)" },
  meeting: { label: "MEETING", color: "var(--desk-security)" },
};

function caffeineColor(v: number) {
  if (v > 60) return "var(--state-done)";
  if (v > 30) return "var(--desk-research)";
  return "var(--destructive)";
}

export function AgentCards({
  agents,
  onTalk,
  onOpenDetail,
}: {
  agents: AgentVisual[];
  onTalk: (id: DeskId) => void;
  onOpenDetail: (id: DeskId) => void;
}) {
  return (
    // Reference project wrapped these into a 2x3 grid; single scrollable row instead.
    <div className="font-mono flex flex-nowrap gap-2 overflow-x-auto pb-1">
      {DESK_META.map((meta) => {
        const v = DESK_VISUALS[meta.id as DeskId];
        const a = agents.find((x) => x.id === meta.id);
        if (!a) return null;
        const badge = BADGE[a.status];
        const meeting = a.status === "meeting";
        return (
          <div
            key={meta.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenDetail(meta.id as DeskId)}
            onKeyDown={(e) => e.key === "Enter" && onOpenDetail(meta.id as DeskId)}
            className="pixel-border relative w-[220px] shrink-0 cursor-pointer rounded-sm bg-card p-2 text-left"
            style={{ borderColor: a.status === "working" ? meta.color : undefined }}
          >
            <div className="flex items-start gap-2">
              <div
                className="pixel-font flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-[11px]"
                style={{
                  background: `color-mix(in oklab, ${meta.color} 30%, var(--card))`,
                  border: `2px solid ${meta.color}`,
                  color: meta.color,
                }}
              >
                {v.glyph}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="pixel-font truncate text-[7px]" style={{ color: meta.color }}>
                    {meta.name}
                  </span>
                  <span
                    className="pixel-font shrink-0 rounded-sm px-1 py-[2px] text-[5px]"
                    style={{ background: "var(--muted)", color: badge.color }}
                  >
                    {meeting ? "MEETING" : badge.label}
                  </span>
                </div>
                <div className="truncate text-[15px] text-muted-foreground">
                  {meeting ? "in a meeting" : a.banter ? a.banter : v.role}
                </div>
              </div>
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                <span>CAFFEINE</span>
                <span>{Math.round(a.caffeine)}%</span>
              </div>
              <div className="mt-[2px] h-[7px] w-full rounded-[1px] border border-border bg-background p-[1px]">
                <div
                  className="h-full rounded-[1px]"
                  style={{
                    width: `${Math.max(2, a.caffeine)}%`,
                    background: caffeineColor(a.caffeine),
                    transition: "width 200ms linear",
                  }}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-1">
              <span
                className="truncate rounded-sm border border-border px-1 py-[2px] text-[13px] text-muted-foreground"
                title={`Powered by ${a.provider}`}
              >
                ◈ {a.provider}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTalk(meta.id as DeskId);
                }}
                disabled={a.busy}
                title="Talk Privately"
                aria-label={`Talk privately with ${meta.name}`}
                className="rounded-sm border border-border px-[6px] py-[2px] text-[14px] transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                ✎
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
