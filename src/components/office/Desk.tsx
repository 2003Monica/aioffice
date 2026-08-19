import type { Desk as DeskData, DeskStatus } from "@/lib/office-api";
import { MonitorSprite, WorkerSprite } from "./sprites";

export const STATE_COLOR: Record<DeskStatus, string> = {
  idle: "var(--state-idle)",
  working: "var(--state-working)",
  done: "var(--state-done)",
};

interface Props {
  desk: DeskData;
  color: string;
  x: number;
  y: number;
  onClick: () => void;
}

export function Desk({ desk, color, x, y, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${desk.name} desk, status ${desk.status}`}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 focus:outline-none"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {/* worker */}
      <WorkerSprite shirt={color} className={desk.status === "working" ? "bob" : ""} />
      {/* chair back */}
      <div className="h-[5px] w-[22px]" style={{ background: "var(--wood-dark)" }} />
      {/* desk surface */}
      <div
        className="relative flex h-[46px] w-[112px] items-start justify-center pt-[3px]"
        style={{ background: "var(--wood)", border: "4px solid var(--wood-dark)" }}
      >
        <MonitorSprite on={desk.status !== "idle"} />
        <span
          className="absolute -right-[6px] -top-[6px] h-[12px] w-[12px]"
          style={{ background: STATE_COLOR[desk.status], border: "2px solid var(--panel-border)" }}
        />
      </div>
      {/* label plate */}
      <div
        className="pixel-box px-2 py-1 text-[8px] leading-none"
        style={{ color, background: "var(--card)" }}
      >
        {desk.name}
      </div>
    </button>
  );
}
