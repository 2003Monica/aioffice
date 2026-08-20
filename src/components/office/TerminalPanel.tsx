import { useEffect, useRef } from "react";
import { DESK_META } from "@/lib/office-api";
import type { TerminalLine } from "@/lib/office-scene";

export function TerminalPanel({ lines }: { lines: TerminalLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines]);

  return (
    <div className="pixel-border font-mono flex h-full min-h-0 flex-col rounded-sm bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--destructive)" }} />
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--desk-research)" }} />
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--state-done)" }} />
        <span className="pixel-font ml-2 text-[7px] text-muted-foreground">LIVE OUTPUT</span>
      </div>
      <div
        ref={ref}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[17px] leading-[1.35]"
      >
        {lines.length === 0 && (
          <span className="text-muted-foreground opacity-60">&gt; awaiting orders_</span>
        )}
        {lines.map((l) => {
          const meta = DESK_META.find((m) => m.id === l.deskId);
          return (
            <div key={l.id} className="flex gap-2">
              <span
                className="pixel-font shrink-0 pt-[3px] text-[6px]"
                style={{ color: l.deskId === "system" ? "var(--primary)" : meta?.color }}
              >
                {l.deskId === "system" ? "SYS" : (meta?.name ?? l.deskId).slice(0, 4)}
              </span>
              <span>{l.text}</span>
            </div>
          );
        })}
        <div className="flex gap-2">
          <span className="pixel-font shrink-0 pt-[3px] text-[6px] text-primary">SYS</span>
          <span className="caret text-primary">█</span>
        </div>
      </div>
    </div>
  );
}
