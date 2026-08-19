interface SpriteProps {
  shirt: string;
  hair?: string;
  className?: string;
  clipboard?: boolean;
}

/** Top-down-ish 16-bit worker sprite drawn with divs (no canvas). */
export function WorkerSprite({ shirt, hair = "oklch(0.3 0.04 60)", className = "", clipboard }: SpriteProps) {
  return (
    <div className={`relative h-[34px] w-[26px] ${className}`}>
      {/* hair / head top */}
      <div className="absolute left-[5px] top-0 h-[6px] w-[16px]" style={{ background: hair }} />
      {/* face */}
      <div className="absolute left-[5px] top-[6px] h-[8px] w-[16px]" style={{ background: "oklch(0.85 0.06 60)" }} />
      {/* eyes */}
      <div className="absolute left-[8px] top-[9px] h-[2px] w-[2px]" style={{ background: "oklch(0.15 0 0)" }} />
      <div className="absolute left-[16px] top-[9px] h-[2px] w-[2px]" style={{ background: "oklch(0.15 0 0)" }} />
      {/* body */}
      <div className="absolute left-[3px] top-[14px] h-[13px] w-[20px]" style={{ background: shirt }} />
      {/* arms */}
      <div className="absolute left-0 top-[16px] h-[8px] w-[3px]" style={{ background: shirt }} />
      <div className="absolute right-0 top-[16px] h-[8px] w-[3px]" style={{ background: shirt }} />
      {/* legs */}
      <div className="absolute left-[5px] top-[27px] h-[7px] w-[6px]" style={{ background: "oklch(0.28 0.05 255)" }} />
      <div className="absolute left-[15px] top-[27px] h-[7px] w-[6px]" style={{ background: "oklch(0.28 0.05 255)" }} />
      {clipboard && (
        <div
          className="absolute -right-[6px] top-[18px] h-[11px] w-[9px]"
          style={{ background: "oklch(0.92 0.05 90)", border: "2px solid oklch(0.2 0.04 60)" }}
        />
      )}
    </div>
  );
}

export function MonitorSprite({ on }: { on: boolean }) {
  return (
    <div className="relative h-[22px] w-[28px]">
      <div className="absolute inset-0" style={{ background: "oklch(0.22 0.03 250)", border: "2px solid oklch(0.14 0.04 255)" }} />
      <div
        className={`absolute left-[4px] top-[4px] h-[10px] w-[20px] ${on ? "blink" : ""}`}
        style={{ background: on ? "var(--screen)" : "oklch(0.3 0.02 240)" }}
      />
      <div className="absolute bottom-0 left-[11px] h-[4px] w-[6px]" style={{ background: "oklch(0.16 0.04 255)" }} />
    </div>
  );
}
