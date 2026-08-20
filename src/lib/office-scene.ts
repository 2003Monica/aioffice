/**
 * Purely cosmetic isometric-scene layout: tile-world positions, screen/glyph
 * per desk, coffee-room banter lines. None of this drives task routing or
 * talks to the backend — that's all still `office-api.ts` (DESK_META,
 * officeApi). This module only maps each real desk id to where it sits in
 * the 3D scene and what its monitor looks like.
 */
/** Mirrors the desk ids in office-api.ts's DESK_META (that file owns the real list). */
export type DeskId = "backend" | "research" | "frontend" | "debugger" | "security" | "sql";

export type Vec = { x: number; y: number };

export type AgentVisualStatus = "idle" | "walking" | "working" | "done" | "coffee" | "meeting";

export type ScreenKind = "code" | "chart" | "canvas" | "trace" | "shield" | "schema";

export type DeskVisual = {
  role: string;
  screen: ScreenKind;
  glyph: string;
  desk: Vec;
  seat: Vec;
};

/** Cosmetic per-desk animation state, layered on top of the real polled DeskStatus. */
export type AgentVisual = {
  id: DeskId;
  pos: Vec;
  status: AgentVisualStatus;
  banter: string | null;
  caffeine: number;
  provider: string;
  busy: boolean;
};

/** World is measured in tiles; 1 tile = TILE px in the isometric scene. */
export const TILE = 46;
export const WORLD: Vec = { x: 15, y: 11 };

export const MANAGER_OFFICE: Vec = { x: 12.6, y: 8.6 };
export const MANAGER_DOOR: Vec = { x: 11.2, y: 7.4 };
export const COFFEE_ROOM: Vec = { x: 1.6, y: 8.8 };
export const COFFEE_DOOR: Vec = { x: 3.4, y: 7.6 };
export const CORRIDOR_Y = 6.6;

export const DESK_VISUALS: Record<DeskId, DeskVisual> = {
  backend: {
    role: "Services & APIs",
    screen: "code",
    glyph: "{ }",
    desk: { x: 2.2, y: 1.6 },
    seat: { x: 2.2, y: 3.0 },
  },
  research: {
    role: "Analysis & Compare",
    screen: "chart",
    glyph: "◔",
    desk: { x: 6.2, y: 1.6 },
    seat: { x: 6.2, y: 3.0 },
  },
  frontend: {
    role: "Interface & Motion",
    screen: "canvas",
    glyph: "▧",
    desk: { x: 10.2, y: 1.6 },
    seat: { x: 10.2, y: 3.0 },
  },
  debugger: {
    role: "Crash Forensics",
    screen: "trace",
    glyph: "!",
    desk: { x: 2.2, y: 4.6 },
    seat: { x: 2.2, y: 6.0 },
  },
  security: {
    role: "Threat & Access",
    screen: "shield",
    glyph: "⌾",
    desk: { x: 6.2, y: 4.6 },
    seat: { x: 6.2, y: 6.0 },
  },
  sql: {
    role: "Schema & Queries",
    screen: "schema",
    glyph: "▤",
    desk: { x: 10.2, y: 4.6 },
    seat: { x: 10.2, y: 6.0 },
  },
};

export const COFFEE_SPOTS: Vec[] = [
  { x: 0.9, y: 8.2 },
  { x: 2.3, y: 8.2 },
  { x: 1.3, y: 9.6 },
  { x: 2.6, y: 9.4 },
];

export const MEETING_SPOTS: Vec[] = [
  { x: 12.2, y: 8.2 },
  { x: 13.2, y: 9.0 },
];

export const ASSISTANT_HOME: Vec = { x: 12.9, y: 9.4 };

export const BANTER = [
  "Refilling. Do not perceive me.",
  "The mug is the true runtime.",
  "I dreamt in YAML again.",
  "Someone renamed the shared folder. Again.",
  "Standing meeting? I prefer sitting.",
  "My last commit message was a cry for help.",
  "Decaf is a denial-of-service attack.",
  "I told the printer no. It insisted.",
  "Two cups and I can read minified code.",
  "The water cooler has better uptime than prod.",
  "Task queue empty. Suspicious.",
  "I labeled my mug 'PROD'. Nobody touches it.",
  "Boss walked by. I typed faster. Nothing happened.",
  "This plant has outlived three roadmaps.",
  "I'm not idle, I'm pre-fetching.",
  "Rubber duck called in sick.",
  "Coffee: the only dependency without a CVE.",
  "Whoever left the mystery Tupperware — we know.",
  "I read the docs. Both sentences.",
  "Latency is just a slow sip.",
];

/**
 * One line in the Live Output feed. No "tone" field: unlike the reference
 * project's mock/NDJSON data, our real backend only ever yields plain
 * strings (see backend/agents.py), so we don't fabricate a distinction
 * that isn't actually there.
 */
export type TerminalLine = {
  id: string;
  deskId: DeskId | "system";
  text: string;
};

export type ChatEntry = {
  id: string;
  order: string;
  deskIds: DeskId[];
  resolved: boolean;
  ts: number;
};

export const ORDER_SUGGESTIONS = [
  "Design a rate-limited login endpoint with proper session auth",
  "Compare vector databases and evaluate the best fit for our schema",
  "We're seeing a null pointer exception — find the root cause of this crash",
];

export function dist(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
