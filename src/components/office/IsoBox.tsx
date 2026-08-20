import { TILE } from "@/lib/office-scene";

type Props = {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color?: string;
  z?: number;
  className?: string;
  topClassName?: string;
  radius?: number;
};

/** A true 3-face isometric box placed in world-tile coordinates. */
export function IsoBox({
  x,
  y,
  w,
  d,
  h,
  color = "var(--wood)",
  z = 0,
  className = "",
  topClassName = "",
  radius = 2,
}: Props) {
  const W = w * TILE;
  const D = d * TILE;
  return (
    <div
      className={`absolute ${className}`}
      style={{ left: x * TILE, top: y * TILE, width: W, height: D, transformStyle: "preserve-3d" }}
    >
      {/* top */}
      <div
        className={`absolute inset-0 ${topClassName}`}
        style={{
          transform: `translateZ(${h + z}px)`,
          background: color,
          borderRadius: radius,
          boxShadow: "inset 0 0 0 1px oklch(0 0 0 / 25%)",
        }}
      />
      {/* front-south face */}
      <div
        className="absolute left-0"
        style={{
          top: D,
          width: W,
          height: h,
          transformOrigin: "top",
          transform: `rotateX(-90deg) translateZ(${z}px)`,
          background: `color-mix(in oklab, ${color} 72%, black)`,
        }}
      />
      {/* front-east face */}
      <div
        className="absolute top-0"
        style={{
          left: W,
          width: h,
          height: D,
          transformOrigin: "left",
          transform: `rotateY(90deg) translateZ(${-z}px)`,
          background: `color-mix(in oklab, ${color} 55%, black)`,
        }}
      />
    </div>
  );
}

type BbProps = {
  x: number;
  y: number;
  z?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/** Upright billboard sprite standing at a world position. */
export function Billboard({ x, y, z = 0, children, className = "", style }: BbProps) {
  return (
    <div
      className="absolute"
      style={{ left: x * TILE, top: y * TILE, transformStyle: "preserve-3d" }}
    >
      <div style={{ transform: `translateZ(${z}px)`, transformStyle: "preserve-3d" }}>
        <div
          className={`billboard absolute bottom-0 left-0 ${className}`}
          style={{ ...style, transform: `rotateZ(45deg) rotateX(-56deg)` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
