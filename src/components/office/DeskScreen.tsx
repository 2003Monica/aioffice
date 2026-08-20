import type { ScreenKind } from "@/lib/office-scene";

/** Role-appropriate content rendered on each agent's monitor. */
export function DeskScreen({
  kind,
  color,
  active,
}: {
  kind: ScreenKind;
  color: string;
  active: boolean;
}) {
  return (
    <div
      className="crt-lines relative h-[34px] w-[54px] overflow-hidden rounded-[2px]"
      style={{
        background: "var(--screen)",
        boxShadow: `inset 0 0 0 1px oklch(0 0 0 / 60%), 0 0 10px color-mix(in oklab, ${color} 45%, transparent)`,
        opacity: active ? 1 : 0.82,
      }}
    >
      <div className="absolute inset-[3px]">{render(kind, color, active)}</div>
    </div>
  );
}

function bar(w: number, c: string, o = 1) {
  return { width: `${w}%`, background: c, opacity: o };
}

function render(kind: ScreenKind, color: string, active: boolean) {
  const speed = active ? "anim-bob" : "";
  switch (kind) {
    case "code":
      return (
        <div className="flex h-full flex-col justify-center gap-[2px]">
          {[70, 44, 86, 34, 60].map((w, i) => (
            <div
              key={i}
              className="h-[2px]"
              style={bar(w, i % 2 ? color : "oklch(0.8 0.02 200)", i % 2 ? 1 : 0.5)}
            />
          ))}
        </div>
      );
    case "chart":
      return (
        <div className="flex h-full items-end gap-[2px]">
          {[40, 70, 30, 90, 55, 75].map((h, i) => (
            <div
              key={i}
              className={i === 3 ? speed : ""}
              style={{ height: `${h}%`, width: 5, background: color, opacity: 0.85 }}
            />
          ))}
        </div>
      );
    case "canvas":
      return (
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-[2px]">
          <div className="col-span-2 rounded-[1px]" style={{ background: color, opacity: 0.75 }} />
          <div
            className="rounded-[1px]"
            style={{ background: "oklch(0.8 0.02 200)", opacity: 0.35 }}
          />
          <div
            className="rounded-[1px]"
            style={{ background: "oklch(0.8 0.02 200)", opacity: 0.25 }}
          />
          <div className="col-span-2 rounded-[1px]" style={{ background: color, opacity: 0.4 }} />
        </div>
      );
    case "trace":
      return (
        <div className="flex h-full flex-col justify-center gap-[2px]">
          <div className="h-[3px]" style={bar(90, "var(--destructive)")} />
          {[62, 78, 40].map((w, i) => (
            <div key={i} className="ml-[6px] h-[2px]" style={bar(w, color, 0.7)} />
          ))}
        </div>
      );
    case "shield":
      return (
        <div className="flex h-full items-center justify-center">
          <div
            className={`h-[18px] w-[15px] ${active ? "anim-bob" : ""}`}
            style={{
              background: color,
              clipPath: "polygon(50% 0,100% 22%,100% 62%,50% 100%,0 62%,0 22%)",
              opacity: 0.9,
            }}
          />
        </div>
      );
    case "schema":
      return (
        <div className="grid h-full grid-cols-2 items-center gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-[1px]">
              <div className="h-[2px]" style={bar(100, color, 0.9)} />
              <div className="h-[1px]" style={bar(80, "oklch(0.8 0.02 200)", 0.4)} />
              <div className="h-[1px]" style={bar(60, "oklch(0.8 0.02 200)", 0.4)} />
            </div>
          ))}
        </div>
      );
  }
}
