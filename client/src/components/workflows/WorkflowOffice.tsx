/**
 * @file WorkflowOffice.tsx
 * @description 2D office view of a Workflow-tool run, a companion to the
 * interaction graph: a warm wood-floored office with Pharmacity touches (logo
 * panel and blue/green trim on the wall, a branded reception by the door,
 * green mugs). Each phase is a carpeted team area and each inner agent is a
 * chibi character (CC0 MetroCity sprites, see public/office/CREDITS.md) with
 * its own desk. Everything is a pure function of the replay clock, so the
 * scrubber works both ways: an agent walks in from the door when it starts,
 * types at its desk while working (tool call in a speech bubble), and a
 * hand-off sends the giver walking down the corridor to the receiver's desk
 * with the file and back; a giver that is busy or already on a trip sends a
 * flying paper instead.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { WorkflowInteractions } from "../../lib/types";

type GraphNode = WorkflowInteractions["nodes"][number];
type Pt = { x: number; y: number };
type Dir = "down" | "up" | "right" | "left";
type Tool = GraphNode["tools"][number];

const S = 2; // sprite pixel scale
const CW = 16 * S;
const CH = 32 * S;
const SLOT_W = 92;
const PER_ROW = 3; // desks per row inside an area
const ZONE_PAD = 14;
const ZONE_HEAD = 30;
const DESK_ROW_H = 112;
const ZONE_GAP = 24;
const CORRIDOR = 58;
const WALL = 58; // windows + Pharmacity logo panel
const BOTTOM = 56; // entrance + reception
const ROOM_PAD = 34;
const SHEETS = 6;

// Pharmacity brand tokens (design system).
const PC = {
  blue: "#0072BC",
  green: "#5FAA46",
};

const ROW: Record<Dir, number> = { down: 0, up: 1, right: 2, left: 2 };

interface Trip {
  /** Giver walks out at `t`, stands at the receiver for `hold`, walks back. */
  t: number;
  /** Standing spot among the givers visiting the same receiver at once. */
  slot: number;
  to: string;
  label: string;
  kind: "file" | "result";
}

interface Props {
  data: WorkflowInteractions;
  runId: string;
  /** Absolute clock (epoch ms) the scene is drawn at. */
  now: number;
  /** Walk duration in run-time ms (one leg of a trip, or entering). */
  walkMs: number;
  /** Show everyone at their desk (final state outside replay): no walking. */
  settled: boolean;
  phaseHex: string[];
  stateOf: (n: GraphNode) => "pending" | "running" | "done" | "error";
  toolOf: (n: GraphNode) => Tool | undefined;
  focus: string | null;
  reduceMotion: boolean;
  resultLabel: string;
  onEnter: (id: string, el: Element) => void;
  onLeave: () => void;
  onPick: (id: string, el: Element) => void;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** One 16×32 frame of a character sheet, drawn with its feet at (x, y). */
function Sprite({
  sheet,
  x,
  y,
  dir,
  col,
}: {
  sheet: number;
  x: number;
  y: number;
  dir: Dir;
  col: number;
}) {
  const flip = dir === "left";
  return (
    <g
      transform={`translate(${x - CW / 2},${y - CH})${flip ? ` translate(${CW},0) scale(-1,1)` : ""}`}
    >
      <svg width={CW} height={CH} viewBox={`${col * 16} ${ROW[dir] * 32} 16 32`} overflow="hidden">
        <image
          href={`/office/char_${sheet}.png`}
          width={112}
          height={96}
          style={{ imageRendering: "pixelated" }}
        />
      </svg>
    </g>
  );
}

/** Point and heading at fraction `f` (0–1) along a polyline. */
function along(pts: Pt[], f: number): { p: Pt; dir: Dir } {
  const segs = pts.slice(1).map((b, i) => {
    const a = pts[i] as Pt;
    return { a, b, len: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) };
  });
  const total = segs.reduce((s, g) => s + g.len, 0) || 1;
  let d = Math.min(1, Math.max(0, f)) * total;
  for (const g of segs) {
    if (d <= g.len || g === segs[segs.length - 1]) {
      const k = g.len ? Math.min(1, d / g.len) : 1;
      const p = { x: g.a.x + (g.b.x - g.a.x) * k, y: g.a.y + (g.b.y - g.a.y) * k };
      const dir: Dir =
        Math.abs(g.b.x - g.a.x) > Math.abs(g.b.y - g.a.y)
          ? g.b.x > g.a.x
            ? "right"
            : "left"
          : g.b.y > g.a.y
            ? "down"
            : "up";
      return { p, dir };
    }
    d -= g.len;
  }
  return { p: pts[pts.length - 1] as Pt, dir: "down" };
}

export function WorkflowOffice({
  data,
  runId,
  now,
  walkMs,
  settled,
  phaseHex,
  stateOf,
  toolOf,
  focus,
  reduceMotion,
  resultLabel,
  onEnter,
  onLeave,
  onPick,
}: Props) {
  // Animation tick for walk cycles, typing and bubbles.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setTick((n) => n + 1), 170);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const layout = useMemo(() => {
    const cols = data.columns.length;
    const perCol = new Map<number, GraphNode[]>();
    for (const n of data.nodes) perCol.set(n.column, [...(perCol.get(n.column) ?? []), n]);
    const maxDesks = Math.max(1, ...[...perCol.values()].map((v) => v.length));
    const zoneW = Math.min(PER_ROW, maxDesks) * SLOT_W + ZONE_PAD * 2;
    const zoneH = ZONE_HEAD + Math.ceil(maxDesks / PER_ROW) * DESK_ROW_H + 6;
    // ~1100 px of room width, so characters render near their native size.
    const zonesPerRow = Math.max(1, Math.min(cols, Math.floor(1100 / (zoneW + ZONE_GAP))));
    const zoneRows = Math.ceil(cols / zonesPerRow);
    const width = ROOM_PAD * 2 + zonesPerRow * zoneW + (zonesPerRow - 1) * ZONE_GAP;
    const height = WALL + 16 + zoneRows * (zoneH + CORRIDOR) + BOTTOM;
    const aisleX = ROOM_PAD / 2;
    const corridorY = (r: number) => WALL + 16 + r * (zoneH + CORRIDOR) + zoneH + CORRIDOR / 2;
    const zones = data.columns.map((c, i) => ({
      key: c.key,
      title: c.title,
      i,
      row: Math.floor(i / zonesPerRow),
      x: ROOM_PAD + (i % zonesPerRow) * (zoneW + ZONE_GAP),
      y: WALL + 16 + Math.floor(i / zonesPerRow) * (zoneH + CORRIDOR),
    }));
    // Stable look per agent: sheets assigned in start order.
    const byStart = [...data.nodes].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    const sheet = new Map(byStart.map((n, i) => [n.id, i % SHEETS]));
    const seat = new Map<string, { feet: Pt; slotX: number; slotY: number; corridor: number }>();
    for (const [col, list] of perCol) {
      const z = zones[col];
      if (!z) continue;
      list.forEach((n, k) => {
        const slotX = z.x + ZONE_PAD + (k % PER_ROW) * SLOT_W;
        const slotY = z.y + ZONE_HEAD + Math.floor(k / PER_ROW) * DESK_ROW_H;
        seat.set(n.id, {
          feet: { x: slotX + SLOT_W / 2, y: slotY + 66 },
          slotX,
          slotY,
          corridor: corridorY(z.row),
        });
      });
    }
    const door = { x: ROOM_PAD + 46, y: height - 14 };
    return {
      width,
      height,
      zones,
      zoneW,
      zoneH,
      seat,
      sheet,
      aisleX,
      door,
      doorCorridor: corridorY(zoneRows - 1),
    };
  }, [data]);

  const { width, height, zones, zoneW, zoneH, seat, sheet, aisleX, door, doorCorridor } = layout;

  /** Corridor route between two feet points. */
  const route = (a: Pt, ca: number, b: Pt, cb: number): Pt[] => {
    const pts: Pt[] = [a, { x: a.x, y: ca }];
    if (ca !== cb) pts.push({ x: aisleX, y: ca }, { x: aisleX, y: cb });
    pts.push({ x: b.x, y: cb }, b);
    return pts;
  };
  const visitSpot = (id: string, slot = 0): Pt => {
    const s = seat.get(id);
    if (!s) return door;
    // Fan visitors out beside and below the receiver's desk.
    return { x: s.feet.x + 30 + (slot % 3) * 16, y: s.feet.y + 18 + Math.floor(slot / 3) * 16 };
  };

  // Hand-off trips: a giver walks to the receiver when the receiver starts,
  // unless it is busy working or already out — then the file flies over.
  const hold = walkMs * 0.7;
  const { trips, papers } = useMemo(() => {
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const trips = new Map<string, Trip[]>();
    const papers: (Trip & { from: string })[] = [];
    const visitors = new Map<string, number>(); // `${to}@${t}` → givers so far
    const sorted = [...data.edges].sort(
      (a, b) => (byId.get(a.to)?.startedAt ?? 0) - (byId.get(b.to)?.startedAt ?? 0)
    );
    for (const e of sorted) {
      const src = byId.get(e.from);
      const dst = byId.get(e.to);
      if (!src || !dst || dst.startedAt == null) continue;
      const t = dst.startedAt;
      const label = e.kind === "file" ? (e.files[0] ?? "") : resultLabel;
      const mine = trips.get(e.from) ?? [];
      const last = mine[mine.length - 1];
      const busy = src.endedAt != null && t < src.endedAt;
      const arriving = src.startedAt != null && t < src.startedAt + walkMs;
      const out = last && t < last.t + 2 * walkMs + hold;
      if (busy || arriving || out) {
        papers.push({ t, slot: 0, to: e.to, from: e.from, label, kind: e.kind });
      } else {
        const k = `${e.to}@${t}`;
        const slot = visitors.get(k) ?? 0;
        visitors.set(k, slot + 1);
        trips.set(e.from, [...mine, { t, slot, to: e.to, label, kind: e.kind }]);
      }
    }
    return { trips, papers };
  }, [data, walkMs, hold, resultLabel]);

  const walkCol = [0, 1, 2, 1][tick % 4] as number;
  const typeCol = 3 + (Math.floor(tick / 2) % 2);

  /** Where an agent is and what it is doing at `now`. */
  const actorAt = (n: GraphNode) => {
    const s = seat.get(n.id);
    if (!s || n.startedAt == null) return null;
    if (now < n.startedAt) return null; // not in the office yet
    if (settled) return { p: s.feet, dir: "down" as Dir, mode: "seat" as const, carry: null };
    if (now < n.startedAt + walkMs) {
      const { p, dir } = along(
        route(door, doorCorridor, s.feet, s.corridor),
        (now - n.startedAt) / walkMs
      );
      return { p, dir, mode: "walk" as const, carry: null as Trip | null };
    }
    for (const trip of trips.get(n.id) ?? []) {
      const dst = seat.get(trip.to);
      if (!dst || now < trip.t || now >= trip.t + 2 * walkMs + hold) continue;
      const to = visitSpot(trip.to, trip.slot);
      const path = route(s.feet, s.corridor, to, dst.corridor);
      if (now < trip.t + walkMs) {
        return { ...along(path, (now - trip.t) / walkMs), mode: "walk" as const, carry: trip };
      }
      if (now < trip.t + walkMs + hold) {
        return { p: to, dir: "up" as Dir, mode: "visit" as const, carry: trip };
      }
      const back = along([...path].reverse(), (now - trip.t - walkMs - hold) / walkMs);
      return { ...back, mode: "walk" as const, carry: null };
    }
    return { p: s.feet, dir: "down" as Dir, mode: "seat" as const, carry: null };
  };

  const hue = (col: number) => phaseHex[col % phaseHex.length] as string;
  const actors = data.nodes.map((n) => ({ n, a: actorAt(n), st: stateOf(n) }));
  const hoverProps = (id: string) => ({
    onMouseEnter: (ev: MouseEvent<SVGGElement>) => onEnter(id, ev.currentTarget),
    onMouseLeave: onLeave,
    onClick: (ev: MouseEvent<SVGGElement>) => onPick(id, ev.currentTarget),
    style: { cursor: "pointer" },
  });
  const dim = (id: string) => (focus && focus !== id ? 0.45 : 1);
  const pid = `wf-office-${runId}`;
  const shadow = `url(#${pid}-sh)`;
  const logoW = 150;
  // Windows on both sides of the centred logo panel.
  const windows = Array.from(
    { length: Math.floor((width - 80) / 150) },
    (_, i) => 60 + i * 150
  ).filter((x) => x + 88 < width / 2 - logoW / 2 - 12 || x > width / 2 + logoW / 2 + 12);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width * 1.2, minWidth: Math.min(width, 860) }}
      role="img"
      aria-label="Office"
    >
      <defs>
        <pattern id={`${pid}-floor`} width="32" height="32" patternUnits="userSpaceOnUse">
          <rect width="32" height="32" fill="#e8dcc4" />
          <rect width="32" height="16" fill="#e2d4b8" />
          <path d="M0 16 H32 M16 0 V16 M8 16 V32" stroke="#d6c5a4" strokeWidth="1" />
        </pattern>
        <filter id={`${pid}-sh`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1f2937" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* Room */}
      <rect x={0} y={0} width={width} height={height} rx={14} fill={`url(#${pid}-floor)`} />
      <rect x={0} y={0} width={width} height={WALL} rx={14} fill="#94a3b8" />
      {/* Pharmacity trim under the wall */}
      <rect x={0} y={WALL - 8} width={width} height={5} fill={PC.blue} />
      <rect x={0} y={WALL - 3} width={width} height={3} fill={PC.green} />
      {windows.map((x) => (
        <g key={x} transform={`translate(${x},10)`}>
          <rect width={88} height={26} rx={3} fill="#dbeafe" stroke="#475569" strokeWidth={3} />
          <path d="M44 0 V26 M0 13 H88" stroke="#475569" strokeWidth={2} />
        </g>
      ))}
      {/* Logo panel */}
      <g transform={`translate(${width / 2 - logoW / 2},5)`} filter={shadow}>
        <rect width={logoW} height={WALL - 16} rx={6} fill="#ffffff" />
        <image href="/pharmacity-logo.png" x={14} y={2} width={logoW - 28} height={WALL - 20} />
      </g>
      {/* Door + Pharmacity reception */}
      <rect x={door.x - 26} y={height - 12} width={52} height={12} rx={2} fill="#92400e" />
      <rect x={door.x - 22} y={height - 9} width={44} height={6} fill="#b45309" />
      <g transform={`translate(${door.x + 40},${height - 46})`} filter={shadow}>
        <rect width={84} height={36} rx={6} fill="#ffffff" stroke="#cbd5e1" />
        <image href="/pharmacity-logo.png" x={10} y={3} width={64} height={22} />
        <text
          x={42}
          y={32}
          textAnchor="middle"
          fontSize="7"
          fontWeight="800"
          letterSpacing="1"
          fill="#334155"
        >
          RECEPTION
        </text>
      </g>
      {/* Plants */}
      {[
        { x: 18, y: WALL + 22 },
        { x: width - 18, y: WALL + 22 },
        { x: width - 18, y: height - 22 },
      ].map((p, i) => (
        <Plant key={i} x={p.x} y={p.y} />
      ))}

      {/* Team areas */}
      {zones.map((z) => {
        const h = hue(z.i);
        const title = z.title ? clip(z.title, 20) : `#${z.i + 1}`;
        return (
          <g key={z.key}>
            <rect
              x={z.x}
              y={z.y}
              width={zoneW}
              height={zoneH}
              rx={10}
              fill={h}
              fillOpacity={0.16}
            />
            <rect
              x={z.x + 3}
              y={z.y + 3}
              width={zoneW - 6}
              height={zoneH - 6}
              rx={8}
              fill="none"
              stroke={h}
              strokeOpacity={0.45}
              strokeDasharray="6 4"
            />
            <g transform={`translate(${z.x + 10},${z.y + 8})`}>
              <rect width={title.length * 7 + 34} height={18} rx={9} fill={h} />
              <text x={10} y={13} fontSize="10" fontWeight="800" fill="#fff">
                {z.i + 1}
              </text>
              <text x={24} y={13} fontSize="10.5" fontWeight="700" fill="#fff">
                {title}
              </text>
            </g>
          </g>
        );
      })}

      {/* Seated layer: chair, (seated actor), desk in front */}
      {actors.map(({ n, a, st }, idx) => {
        const s = seat.get(n.id);
        if (!s) return null;
        const seated = a?.mode === "seat";
        const working = seated && st === "running";
        const cx = s.feet.x;
        const deskY = s.slotY + 48;
        return (
          <g key={n.id} {...hoverProps(n.id)} opacity={dim(n.id)}>
            <rect x={cx - 14} y={s.slotY + 16} width={28} height={30} rx={6} fill="#475569" />
            {seated && (
              <Sprite
                sheet={sheet.get(n.id) ?? 0}
                x={cx}
                y={s.feet.y}
                dir="down"
                col={working ? typeCol : 1}
              />
            )}
            <rect
              x={s.slotX + 6}
              y={deskY}
              width={SLOT_W - 12}
              height={26}
              rx={4}
              fill="#a16207"
              filter={shadow}
            />
            <rect x={s.slotX + 6} y={deskY} width={SLOT_W - 12} height={6} rx={3} fill="#ca8a04" />
            <rect x={s.slotX + 12} y={deskY - 12} width={26} height={17} rx={2} fill="#334155" />
            <rect
              x={s.slotX + 14}
              y={deskY - 10}
              width={22}
              height={11}
              rx={1}
              fill={working ? "#60a5fa" : "#1e293b"}
              opacity={working ? 0.55 + 0.45 * (tick % 2) : 1}
            />
            <rect x={cx - 10} y={deskY + 10} width={20} height={6} rx={1} fill="#e5e7eb" />
            {idx % 2 === 0 && (
              <g transform={`translate(${s.slotX + SLOT_W - 26},${deskY + 9})`}>
                <rect width={7} height={8} rx={1.5} fill={PC.green} />
                <path d="M7 2 h2 v4 h-2" fill="none" stroke={PC.green} strokeWidth={1.2} />
              </g>
            )}
            <text
              x={cx}
              y={deskY + 40}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#1f2937"
              stroke="#f8fafc"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {clip(n.label || n.id.slice(0, 8), 16)}
            </text>
            {st === "done" && a && (
              <g transform={`translate(${s.slotX + SLOT_W - 16},${deskY - 4})`}>
                <circle r={7} fill="#10b981" stroke="#fff" strokeWidth={2} />
                <path
                  d="M-3,0 L-1,2.2 L3,-2"
                  fill="none"
                  stroke="#fff"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </g>
            )}
            {st === "error" && a && (
              <g transform={`translate(${s.slotX + SLOT_W - 16},${deskY - 4})`}>
                <circle r={7} fill="#ef4444" stroke="#fff" strokeWidth={2} />
                <text y={3.5} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">
                  !
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Route trails for trips in progress */}
      {actors.map(({ n, a }) => {
        if (!a?.carry || a.mode !== "walk") return null;
        const s = seat.get(n.id);
        const d = seat.get(a.carry.to);
        if (!s || !d) return null;
        const pts = route(s.feet, s.corridor, visitSpot(a.carry.to, a.carry.slot), d.corridor);
        return (
          <polyline
            key={`trail-${n.id}`}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={hue(n.column)}
            strokeWidth={2}
            strokeDasharray="2 6"
            strokeLinecap="round"
            opacity={0.7}
          />
        );
      })}

      {/* Flying papers (hand-offs the giver could not walk over) */}
      {papers.map((pp, i) => {
        if (settled || now < pp.t || now >= pp.t + walkMs) return null;
        const a = seat.get(pp.from);
        const b = seat.get(pp.to);
        if (!a || !b) return null;
        const f = (now - pp.t) / walkMs;
        const x = a.feet.x + (b.feet.x - a.feet.x) * f;
        const y = a.feet.y - 40 + (b.feet.y - a.feet.y) * f - Math.sin(Math.PI * f) * 40;
        const col = pp.kind === "file" ? "#0ea5e9" : "#a855f7";
        return (
          <g
            key={`paper-${i}`}
            transform={`translate(${x},${y}) rotate(${(f * 40 - 20).toFixed(1)})`}
          >
            <rect
              x={-7}
              y={-9}
              width={14}
              height={18}
              rx={1.5}
              fill="#fff"
              stroke={col}
              strokeWidth={1.5}
            />
            <path d="M-4 -4 H4 M-4 0 H4 M-4 4 H2" stroke={col} strokeWidth={1.2} />
            <text
              y={-13}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill={col}
              stroke="#fff"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {clip(pp.label, 16)}
            </text>
          </g>
        );
      })}

      {/* Walking / visiting actors, drawn above desks */}
      {actors.map(({ n, a }) => {
        if (!a || a.mode === "seat") return null;
        const col = a.mode === "visit" ? 1 : walkCol;
        const tag = a.carry ? clip(a.carry.label, 16) : "";
        const half = tag.length * 2.9 + 20;
        return (
          <g key={`walker-${n.id}`} {...hoverProps(n.id)} opacity={dim(n.id)}>
            <ellipse cx={a.p.x} cy={a.p.y} rx={10} ry={3.5} fill="#0f172a" opacity={0.2} />
            <Sprite sheet={sheet.get(n.id) ?? 0} x={a.p.x} y={a.p.y} dir={a.dir} col={col} />
            {a.carry ? (
              <g
                transform={`translate(${Math.min(Math.max(a.p.x, half), width - half)},${a.p.y - CH - 8})`}
              >
                <rect
                  x={-half + 4}
                  y={-10}
                  width={half * 2 - 8}
                  height={17}
                  rx={8.5}
                  fill="#fff"
                  stroke={a.carry.kind === "file" ? "#0ea5e9" : "#a855f7"}
                  strokeWidth={1.5}
                />
                <text
                  x={0}
                  y={2.5}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="700"
                  fill="#1f2937"
                >
                  {a.carry.kind === "file" ? "📄 " : "✉ "}
                  {tag}
                </text>
              </g>
            ) : (
              <text
                x={a.p.x}
                y={a.p.y - CH - 4}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#1f2937"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {clip(n.label || "", 16)}
              </text>
            )}
          </g>
        );
      })}

      {/* Speech bubbles: the tool call a working actor is on */}
      {actors.map(({ n, a, st }) => {
        if (a?.mode !== "seat" || st !== "running") return null;
        const tool = toolOf(n);
        const s = seat.get(n.id);
        if (!tool || !s) return null;
        const text = clip(`${tool.name}: ${tool.summary}`, 26);
        const w = text.length * 5.5 + 16;
        const x = Math.min(Math.max(s.feet.x - w / 2, 4), width - w - 4);
        return (
          <g key={`bubble-${n.id}`} transform={`translate(${x},${s.slotY - 16})`}>
            <rect width={w} height={18} rx={9} fill="#f59e0b" filter={shadow} />
            <path
              d={`M${s.feet.x - x - 5},17 L${s.feet.x - x},24 L${s.feet.x - x + 5},17 z`}
              fill="#f59e0b"
            />
            <text x={8} y={12.5} fontSize="9.5" fontWeight="700" fill="#1f2937">
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Potted office plant in Pharmacity greens. */
function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-7} y={2} width={14} height={12} rx={2} fill="#b45309" />
      <circle cx={-5} cy={-2} r={7} fill="#3F8F2C" />
      <circle cx={5} cy={-3} r={7} fill={PC.green} />
      <circle cx={0} cy={-9} r={7} fill="#6DBD45" />
    </g>
  );
}
