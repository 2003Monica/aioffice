import { DESK_META, type Desk } from "@/lib/office-api";
import { STATE_COLOR } from "./Desk";

export function StatusStrip({ desks, onSelect }: { desks: Desk[]; onSelect: (id: string) => void }) {
  return (
    <div className="pixel-box flex flex-wrap items-center gap-4 p-3">
      <span className="text-[8px] text-muted-foreground">MINIMAP</span>
      {desks.map((d) => {
        const meta = DESK_META.find((m) => m.id === d.id);
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d.id)}
            className="flex items-center gap-2 text-[8px]"
            style={{ color: meta?.color }}
          >
            <span
              className={`h-[10px] w-[10px] ${d.status === "working" ? "blink" : ""}`}
              style={{ background: STATE_COLOR[d.status], border: "2px solid var(--panel-border)" }}
            />
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
