import { Billboard } from "./IsoBox";
import type { AgentVisualStatus } from "@/lib/office-scene";

type Props = {
  x: number;
  y: number;
  color: string;
  status: AgentVisualStatus;
  label?: string;
  banter?: string | null;
  small?: boolean;
};

const STATUS_MARK: Partial<Record<AgentVisualStatus, string>> = {
  working: "⚙",
  done: "✓",
  coffee: "☕",
  meeting: "✎",
};

export function Character({ x, y, color, status, label, banter, small }: Props) {
  const walking = status === "walking";
  const scale = small ? 0.82 : 1;

  return (
    <Billboard x={x} y={y} z={2}>
      <div
        className="relative flex flex-col items-center"
        style={{ transformOrigin: "bottom center", transform: `translate(-50%,0) scale(${scale})` }}
      >
        {banter && (
          <div
            className="pixel-border font-mono absolute bottom-[64px] w-[150px] rounded-sm px-2 py-1 text-center text-[13px] leading-tight"
            style={{ background: "var(--card)", color: "var(--foreground)" }}
          >
            {banter}
          </div>
        )}
        {STATUS_MARK[status] && !banter && (
          <div
            className="absolute bottom-[58px] rounded-sm px-1 text-[13px] leading-none"
            style={{ background: "var(--card)", color, border: `1px solid ${color}` }}
          >
            {STATUS_MARK[status]}
          </div>
        )}

        <div className={walking ? "anim-bob" : "anim-breathe"}>
          {/* head */}
          <div
            className="mx-auto h-[13px] w-[13px] rounded-[2px]"
            style={{
              background: "oklch(0.82 0.06 62)",
              boxShadow: "inset 0 -3px 0 oklch(0 0 0 / 15%)",
            }}
          >
            <div
              className="mt-[2px] h-[3px] w-full rounded-t-[2px]"
              style={{ background: color, opacity: 0.9 }}
            />
            <div className="mt-[1px] flex justify-center gap-[3px]">
              <span
                className="block h-[2px] w-[2px]"
                style={{ background: "oklch(0.2 0.02 60)" }}
              />
              <span
                className="block h-[2px] w-[2px]"
                style={{ background: "oklch(0.2 0.02 60)" }}
              />
            </div>
          </div>
          {/* body */}
          <div
            className="mx-auto mt-[1px] h-[17px] w-[16px] rounded-[2px]"
            style={{ background: color, boxShadow: "inset -3px 0 0 oklch(0 0 0 / 22%)" }}
          />
          {/* legs */}
          <div className="mx-auto flex w-[16px] justify-between">
            <span className="h-[6px] w-[6px]" style={{ background: "oklch(0.34 0.03 250)" }} />
            <span className="h-[6px] w-[6px]" style={{ background: "oklch(0.34 0.03 250)" }} />
          </div>
        </div>
        {/* shadow */}
        <div
          className="mt-[1px] h-[5px] w-[20px] rounded-full"
          style={{ background: "oklch(0 0 0 / 35%)", filter: "blur(1px)" }}
        />
        {label && (
          <div className="pixel-font mt-[2px] text-[6px]" style={{ color }}>
            {label}
          </div>
        )}
      </div>
    </Billboard>
  );
}
