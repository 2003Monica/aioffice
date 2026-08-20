import { useEffect, useRef, useState } from "react";
import { Billboard, IsoBox } from "./IsoBox";
import { Character } from "./Character";
import { DeskScreen } from "./DeskScreen";
import { DESK_META } from "@/lib/office-api";
import {
  DESK_VISUALS,
  TILE,
  WORLD,
  type AgentVisual,
  type AgentVisualStatus,
  type DeskId,
  type Vec,
} from "@/lib/office-scene";

// The rotateZ(-45deg) + rotateX(56deg) pair in the "iso-scene" utility
// (styles.css) projects any flat rectangle into a diamond with a fixed
// ~1.79:1 width:height ratio -- that ratio comes entirely from the two
// rotation angles, not from WORLD's x:y proportions (scaling WORLD's axes
// independently doesn't change it), so a wider room always reads as a
// long, thin sliver. Applying an extra X-only scale after the rotation is
// the only way to make the room look more compact/square without changing
// the rotation angles (which would also change how upright characters and
// desk labels look, since their Billboard counter-rotation assumes them).
// Chosen so the rendered diamond's aspect ratio (~1.79:1 uncorrected) lands
// close to WORLD's own 15:11 (~1.36:1) tile-grid ratio, so the room reads
// as proportioned to its actual footprint instead of an arbitrary artifact
// of the 45deg/56deg rotation.
const X_COMPRESS = 0.76;

export function OfficeFloor({
  agents,
  assistant,
  onSelectDesk,
}: {
  agents: AgentVisual[];
  assistant: { pos: Vec; status: AgentVisualStatus };
  onSelectDesk: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const wrapEl = wrap.current;
    const sceneEl = scene.current;
    if (!wrapEl || !sceneEl) return;

    const ro = new ResizeObserver(() => {
      const w = wrapEl.clientWidth;
      const h = wrapEl.clientHeight;
      if (w === 0 || h === 0) return;

      setScale((prevScale) => {
        // .iso-scene's own getBoundingClientRect() only covers its nominal
        // WORLD.x*TILE x WORLD.y*TILE box -- it does NOT include descendants
        // that paint outside that box (extruded wall/prop heights after the
        // rotateX tilt, and a few props placed at out-of-range tile
        // coordinates), so it undercounts the true rendered extent. Measure
        // the union of every descendant's rect instead -- the only way to
        // get the real painted bounds of a preserve-3d subtree with
        // absolutely-positioned children. Dividing out the scale/X_COMPRESS
        // we last applied recovers the true *unscaled* bounds so this stays
        // correct across resizes regardless of the previous scale value.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const el of sceneEl.parentElement!.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.left < minX) minX = r.left;
          if (r.top < minY) minY = r.top;
          if (r.right > maxX) maxX = r.right;
          if (r.bottom > maxY) maxY = r.bottom;
        }
        if (!isFinite(minX)) return prevScale;

        const naturalW = (maxX - minX) / (prevScale * X_COMPRESS);
        const naturalH = (maxY - minY) / prevScale;
        if (naturalW === 0 || naturalH === 0) return prevScale;
        const fit = Math.min(w / (naturalW * X_COMPRESS), h / naturalH);
        // small safety margin so sub-pixel rounding never clips an edge
        return Math.min(fit * 0.96, 2.2);
      });
    });
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrap}
      className="pixel-border relative h-full w-full overflow-hidden rounded-sm"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 10%, oklch(0.26 0.04 200), oklch(0.16 0.03 200))",
        perspective: 1600,
      }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(-50%,-50%) scale(${scale * X_COMPRESS}, ${scale})`,
          transformOrigin: "center",
        }}
      >
        <div
          ref={scene}
          className="iso-scene relative"
          style={{ width: WORLD.x * TILE, height: WORLD.y * TILE, transformOrigin: "center" }}
        >
          {/* ---------------------------------------------------- floors */}
          <div
            className="absolute inset-0"
            style={{
              background: `repeating-conic-gradient(var(--floor) 0% 25%, var(--floor-alt) 0% 50%)`,
              backgroundSize: `${TILE}px ${TILE}px`,
              boxShadow: "0 0 0 3px oklch(0.2 0.03 200)",
            }}
          />
          {/* coffee room flooring */}
          <RoomFloor
            x={0}
            y={7.4}
            w={4}
            d={3.6}
            tone="oklch(0.55 0.06 60)"
            alt="oklch(0.48 0.06 60)"
          />
          {/* manager office flooring */}
          <RoomFloor
            x={11}
            y={7.4}
            w={4}
            d={3.6}
            tone="oklch(0.4 0.045 265)"
            alt="oklch(0.35 0.045 265)"
          />

          {/* ------------------------------------------- walls / partitions */}
          <IsoBox x={0} y={7.2} w={4} d={0.22} h={40} color="var(--wall)" />
          <IsoBox x={3.9} y={7.2} w={0.22} d={3.8} h={40} color="var(--wall)" />
          <IsoBox x={11} y={7.2} w={4} d={0.22} h={40} color="var(--wall)" />
          <IsoBox x={10.9} y={7.2} w={0.22} d={3.8} h={40} color="var(--wall)" />
          {/* back wall */}
          <IsoBox x={-0.25} y={-0.3} w={15.5} d={0.25} h={72} color="var(--wall-dark)" />
          <IsoBox x={-0.3} y={-0.3} w={0.25} d={11.4} h={72} color="var(--wall-dark)" />

          {/* doorway frames */}
          <Billboard x={3.4} y={7.3} z={0}>
            <div
              className="pixel-font -translate-x-1/2 whitespace-nowrap rounded-sm px-1 py-[2px] text-[6px]"
              style={{ background: "var(--wood-dark)", color: "var(--wood-light)" }}
            >
              COFFEE ROOM
            </div>
          </Billboard>
          <Billboard x={11.4} y={7.3} z={0}>
            <div
              className="pixel-font -translate-x-1/2 whitespace-nowrap rounded-sm px-1 py-[2px] text-[6px]"
              style={{ background: "oklch(0.3 0.05 265)", color: "oklch(0.85 0.05 265)" }}
            >
              MANAGER'S OFFICE
            </div>
          </Billboard>

          {/* -------------------------------------------------- coffee room */}
          <IsoBox x={1.1} y={8.6} w={1.6} d={1.1} h={22} color="var(--wood)" />
          <IsoBox x={0.55} y={8.7} w={0.4} d={0.4} h={14} color="var(--wood-dark)" />
          <IsoBox x={2.9} y={8.7} w={0.4} d={0.4} h={14} color="var(--wood-dark)" />
          <IsoBox x={1.6} y={9.9} w={0.4} d={0.4} h={14} color="var(--wood-dark)" />
          {/* counter + coffee station + sink */}
          <IsoBox x={0.2} y={7.6} w={2.6} d={0.6} h={26} color="var(--wood-light)" />
          <Billboard x={0.7} y={8.15} z={26}>
            <div className="-translate-x-1/2">
              <div
                className="h-[16px] w-[12px] rounded-[2px]"
                style={{ background: "oklch(0.35 0.03 40)" }}
              />
              <div className="mx-auto h-[4px] w-[8px]" style={{ background: "var(--primary)" }} />
            </div>
          </Billboard>
          <Billboard x={1.6} y={8.15} z={26}>
            <div
              className="-translate-x-1/2 h-[8px] w-[8px] rounded-[1px]"
              style={{ background: "oklch(0.75 0.03 200)" }}
            />
          </Billboard>
          <Billboard x={2.3} y={8.15} z={26}>
            <div
              className="-translate-x-1/2 h-[10px] w-[9px] rounded-[1px]"
              style={{ background: "oklch(0.7 0.09 30)" }}
            />
          </Billboard>

          {/* ---------------------------------------------- manager's office */}
          <IsoBox x={11.9} y={8.6} w={1.9} d={1.0} h={24} color="var(--wood-dark)" />
          <IsoBox x={12.6} y={9.9} w={0.45} d={0.45} h={16} color="var(--wood)" />
          <IsoBox x={13.9} y={8.0} w={0.5} d={1.6} h={54} color="oklch(0.42 0.06 265)" />
          <Billboard x={12.85} y={8.6} z={24}>
            <div className="-translate-x-1/2">
              <DeskScreen kind="chart" color="var(--primary)" active />
            </div>
          </Billboard>

          {/* ------------------------------------------------- office props */}
          <Plant x={4.6} y={0.4} />
          <Plant x={13.6} y={0.4} />
          <Plant x={8.6} y={6.6} />
          {/* printer */}
          <IsoBox x={12.6} y={2.2} w={0.9} d={0.7} h={30} color="oklch(0.5 0.02 250)" />
          <Billboard x={13.05} y={2.55} z={30}>
            <div
              className="-translate-x-1/2 h-[6px] w-[22px]"
              style={{ background: "oklch(0.9 0.01 200)" }}
            />
          </Billboard>
          {/* water cooler */}
          <IsoBox x={0.3} y={5.6} w={0.6} d={0.6} h={40} color="oklch(0.6 0.04 210)" />
          <Billboard x={0.6} y={5.9} z={40}>
            <div
              className="-translate-x-1/2 h-[16px] w-[13px] rounded-[3px]"
              style={{ background: "oklch(0.72 0.09 210)" }}
            />
          </Billboard>
          {/* bookshelves */}
          <IsoBox x={7.6} y={-0.05} w={1.8} d={0.5} h={72} color="var(--wood-dark)" />
          {/* bulletin board */}
          <Billboard x={5.6} y={-0.05} z={40}>
            <div
              className="pixel-border -translate-x-1/2 rounded-sm p-1"
              style={{ background: "var(--wood-light)" }}
            >
              <div className="grid grid-cols-3 gap-[3px]">
                {DESK_META.map((m) => (
                  <span
                    key={m.id}
                    className="block h-[7px] w-[9px]"
                    style={{ background: m.color, opacity: 0.85 }}
                  />
                ))}
              </div>
            </div>
          </Billboard>

          {/* ------------------------------------------------------- desks */}
          {DESK_META.map((meta) => {
            const v = DESK_VISUALS[meta.id as DeskId];
            const a = agents.find((x) => x.id === meta.id);
            const atDesk = a && Math.hypot(a.pos.x - v.seat.x, a.pos.y - v.seat.y) < 0.35;
            const working = a?.status === "working";
            return (
              <div key={meta.id}>
                {/* desk surface */}
                <IsoBox
                  x={v.desk.x - 0.9}
                  y={v.desk.y - 0.4}
                  w={2.0}
                  d={1.0}
                  h={26}
                  color="var(--wood)"
                />
                {/* drawer unit */}
                <IsoBox
                  x={v.desk.x + 0.55}
                  y={v.desk.y - 0.35}
                  w={0.5}
                  d={0.9}
                  h={24}
                  color="var(--wood-dark)"
                />
                {/* chair */}
                <IsoBox
                  x={v.seat.x - 0.28}
                  y={v.seat.y - 0.3}
                  w={0.6}
                  d={0.6}
                  h={14}
                  color="oklch(0.36 0.03 250)"
                />
                {/* accent nameplate strip */}
                <IsoBox
                  x={v.desk.x - 0.9}
                  y={v.desk.y + 0.6}
                  w={2.0}
                  d={0.08}
                  h={28}
                  color={meta.color}
                />

                {/* monitor -- click to inspect this desk */}
                <Billboard x={v.desk.x - 0.15} y={v.desk.y + 0.1} z={26}>
                  <button
                    type="button"
                    onClick={() => onSelectDesk(meta.id)}
                    aria-label={`${meta.name} desk, status ${a?.status ?? "idle"}`}
                    className="-translate-x-1/2 cursor-pointer border-0 bg-transparent p-0 focus:outline-none"
                  >
                    <DeskScreen kind={v.screen} color={meta.color} active={working} />
                    <div
                      className="mx-auto h-[5px] w-[8px]"
                      style={{ background: "oklch(0.3 0.02 250)" }}
                    />
                    <div
                      className="mx-auto h-[2px] w-[20px]"
                      style={{ background: "oklch(0.25 0.02 250)" }}
                    />
                  </button>
                </Billboard>
                {/* desk props: mug + notes */}
                <Billboard x={v.desk.x + 0.62} y={v.desk.y + 0.15} z={26}>
                  <div
                    className="-translate-x-1/2 h-[8px] w-[7px] rounded-b-[2px]"
                    style={{ background: meta.color }}
                  />
                </Billboard>
                <Billboard x={v.desk.x - 0.72} y={v.desk.y + 0.15} z={26}>
                  <div
                    className="-translate-x-1/2 h-[5px] w-[10px]"
                    style={{ background: "oklch(0.88 0.03 90)" }}
                  />
                </Billboard>

                {/* floating desk label -- also clickable */}
                <Billboard x={v.desk.x - 0.15} y={v.desk.y - 0.5} z={70}>
                  <button
                    type="button"
                    onClick={() => onSelectDesk(meta.id)}
                    aria-label={`${meta.name} desk, status ${a?.status ?? "idle"}`}
                    className="pixel-font -translate-x-1/2 cursor-pointer whitespace-nowrap rounded-sm border-0 px-[4px] py-[3px] text-[6px] focus:outline-none"
                    style={{
                      background: "oklch(0.18 0.03 200 / 88%)",
                      color: meta.color,
                      border: `1px solid ${meta.color}`,
                      opacity: atDesk ? 1 : 0.45,
                    }}
                  >
                    {meta.name}
                  </button>
                </Billboard>
              </div>
            );
          })}

          {/* --------------------------------------------------- characters */}
          {agents.map((a) => {
            const meta = DESK_META.find((m) => m.id === a.id)!;
            return (
              <Character
                key={a.id}
                x={a.pos.x}
                y={a.pos.y}
                color={meta.color}
                status={a.status}
                banter={a.banter}
              />
            );
          })}
          <Character
            x={assistant.pos.x}
            y={assistant.pos.y}
            color="var(--primary)"
            status={assistant.status}
            label="ASSISTANT"
            small
          />
        </div>
      </div>
    </div>
  );
}

function RoomFloor({
  x,
  y,
  w,
  d,
  tone,
  alt,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  tone: string;
  alt: string;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: x * TILE,
        top: y * TILE,
        width: w * TILE,
        height: d * TILE,
        transform: "translateZ(1px)",
        background: `repeating-linear-gradient(90deg, ${tone} 0 ${TILE / 2}px, ${alt} ${TILE / 2}px ${TILE}px)`,
      }}
    />
  );
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <>
      <IsoBox x={x} y={y} w={0.45} d={0.45} h={16} color="oklch(0.55 0.09 40)" />
      <Billboard x={x + 0.22} y={y + 0.22} z={16}>
        <div className="-translate-x-1/2">
          <div
            className="mx-auto h-[16px] w-[4px]"
            style={{ background: "oklch(0.45 0.09 145)" }}
          />
          <div
            className="mx-auto -mt-[18px] h-[18px] w-[20px] rounded-full"
            style={{ background: "oklch(0.52 0.12 148)" }}
          />
        </div>
      </Billboard>
    </>
  );
}
