import { DESK_META } from "@/lib/office-api";
import { DESK_VISUALS, WORLD, type AgentVisual, type DeskId } from "@/lib/office-scene";

export function Minimap({ agents }: { agents: AgentVisual[] }) {
  const W = 132;
  const H = (WORLD.y / WORLD.x) * W;
  return (
    <div className="pixel-border rounded-sm bg-card/95 p-2">
      <div className="pixel-font mb-2 text-[7px] text-muted-foreground">MINIMAP</div>
      <div className="relative" style={{ width: W, height: H, background: "var(--floor-alt)" }}>
        <div
          className="absolute"
          style={{
            left: 0,
            top: "68%",
            width: "26%",
            height: "32%",
            background: "var(--wall-dark)",
          }}
        />
        <div
          className="absolute"
          style={{
            right: 0,
            top: "68%",
            width: "26%",
            height: "32%",
            background: "var(--wall-dark)",
          }}
        />
        {DESK_META.map((meta) => {
          const v = DESK_VISUALS[meta.id as DeskId];
          const a = agents.find((x) => x.id === meta.id);
          const active = a?.status === "working";
          return (
            <div key={meta.id}>
              <div
                className="absolute rounded-[1px]"
                style={{
                  left: `${(v.desk.x / WORLD.x) * 100}%`,
                  top: `${(v.desk.y / WORLD.y) * 100}%`,
                  width: 12,
                  height: 7,
                  background: "var(--wood-dark)",
                }}
              />
              {a && (
                <div
                  className={`absolute rounded-full ${active ? "anim-ping-ring" : ""}`}
                  style={{
                    left: `${(a.pos.x / WORLD.x) * 100}%`,
                    top: `${(a.pos.y / WORLD.y) * 100}%`,
                    width: 6,
                    height: 6,
                    background: meta.color,
                    color: meta.color,
                    transition: "left 90ms linear, top 90ms linear",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
