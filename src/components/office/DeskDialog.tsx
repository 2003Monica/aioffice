import { PROVIDERS, type Desk } from "@/lib/office-api";
import { STATE_COLOR } from "./Desk";

interface Props {
  desk: Desk;
  color: string;
  onClose: () => void;
  onProviderChange: (provider: string) => void;
}

export function DeskDialog({ desk, color, onClose, onProviderChange }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0 0 0 / 65%)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pixel-panel w-full max-w-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${desk.name} agent panel`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-[12px] leading-tight" style={{ color }}>
            {desk.name} AGENT
          </h2>
          <button type="button" onClick={onClose} className="pixel-btn !px-2 !py-1 text-[10px]">
            X
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2 text-[9px] text-muted-foreground">
          <span className="h-[10px] w-[10px]" style={{ background: STATE_COLOR[desk.status] }} />
          <span>STATUS: {desk.status.toUpperCase()}</span>
        </div>

        <p className="mb-4 text-[9px] leading-relaxed text-foreground">
          TASK: {desk.current_task ?? "IDLE — AWAITING ORDERS"}
        </p>

        <div
          className="scanlines relative mb-4 h-40 overflow-y-auto p-3 text-[8px] leading-relaxed"
          style={{
            background: "var(--terminal-bg)",
            color: "var(--terminal-text)",
            border: "4px solid var(--panel-border)",
          }}
        >
          {desk.output.length === 0 ? (
            <span className="opacity-60">&gt; no output yet_</span>
          ) : (
            desk.output.map((line, i) => (
              <div key={i} className="mb-1">
                {line}
              </div>
            ))
          )}
        </div>

        <label className="block text-[8px] text-muted-foreground">
          AI PROVIDER
          <select
            value={desk.provider}
            onChange={(e) => onProviderChange(e.target.value)}
            className="pixel-input mt-2 block w-full appearance-none text-[9px]"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
