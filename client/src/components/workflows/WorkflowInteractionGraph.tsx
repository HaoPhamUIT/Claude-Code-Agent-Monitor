/**
 * @file WorkflowInteractionGraph.tsx
 * @description Agent-interaction stage for one Workflow-tool run. Phases are
 * lanes, inner agents are actors (an avatar picked from the label's role, a
 * spinning halo while working, a ✓/! badge when done), and hand-offs are
 * gradient arrows — a file one agent wrote and a later agent read (solid) or a
 * result the script forwarded into a later agent's prompt (dashed) — with data
 * particles flowing along them. A working actor shows a speech bubble with the
 * tool call it is on. Replay re-stages the run on a compressed clock (scrubber,
 * speed, full screen): actors enter as they started, hand-offs light up as
 * their receiver starts. Refetches whenever the run row changes, so a running
 * workflow grows live. An Office tab (WorkflowOffice) stages the same clock as a
 * 2D office with walking chibi characters. Hovering an actor opens a detail card (hand-offs, files
 * written, tool calls with failures marked, result); clicking pins it.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Briefcase,
  Armchair,
  Building2,
  ClipboardList,
  Code,
  FlaskConical,
  Maximize2,
  Minimize2,
  Palette,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  ScanSearch,
  Share2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../lib/api";
import type { WorkflowInteractions, WorkflowRun } from "../../lib/types";
import { fmt, formatMs } from "../../lib/format";
import { WorkflowOffice } from "./WorkflowOffice";

type GraphNode = WorkflowInteractions["nodes"][number];
type GraphEdge = WorkflowInteractions["edges"][number];

const NODE_W = 188;
const NODE_H = 60;
const COL_STEP = NODE_W + 64;
const ROW_STEP = NODE_H + 30;
const PAD = 22;
const HEADER = 44; // lane header pill
const BUBBLE = 26; // headroom for speech bubbles above the first row
const AV_X = 30;
const AV_Y = NODE_H / 2;

// Same hues, same order as WorkflowRunsPanel's PHASE_PALETTE.
const PHASE_HEX = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#f43f5e", "#06b6d4", "#d946ef"];
const RUNNING = "#f59e0b";
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const PLAY_MS = 16000; // a whole run replays in ~16 s at 1×
const WALK_REAL_MS = 1500; // one office walk lasts ~1.5 s of replay at 1×

// Role → avatar. Checked against the label's prefix ("QA: unit tests" → "QA");
// fix/verify are checked on the whole label first so "Dev: fix #1" is a fixer.
const ROLE_ICONS: [RegExp, LucideIcon][] = [
  [/\b(pm|po|product)\b/i, Briefcase],
  [/\b(ba|analyst|analysis)\b/i, ClipboardList],
  [/\b(ux|ui|designer)\b/i, Palette],
  [/architect/i, Building2],
  [/\b(dev|developer|engineer|coder|impl)/i, Code],
  [/\b(qa|test|tester)\b/i, FlaskConical],
  [/review|audit/i, ScanSearch],
  [/writer|docs?\b/i, PenLine],
];

function roleIcon(label: string | null): LucideIcon {
  const l = label || "";
  if (/\bfix/i.test(l)) return Wrench;
  if (/verif/i.test(l)) return ShieldCheck;
  const prefix = l.split(":")[0] ?? "";
  return ROLE_ICONS.find(([re]) => re.test(prefix))?.[1] ?? Bot;
}

const isRunning = (s: string | null) => s === "running" || s === "working" || s === "queued";
const isError = (s: string | null) => s === "error" || s === "failed";

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Interaction stage for `run`; renders nothing until the first fetch lands. */
export function WorkflowInteractionGraph({ run }: { run: WorkflowRun }) {
  const { t } = useTranslation("workflows");
  const [data, setData] = useState<WorkflowInteractions | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // Detail-card anchor in px, relative to `wrapRef` (the stage's outer box).
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  // Replay clock: ms since the run's first start; null = show the final state.
  const [playT, setPlayT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [full, setFull] = useState(false);
  const [view, setView] = useState<"graph" | "office">("graph");
  const wrapRef = useRef<HTMLDivElement>(null);
  const focus = pinned ?? hover;
  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    let alive = true;
    api.workflows
      .interactions(run.run_id)
      .then((d) => alive && setData(d))
      .catch(() => {
        /* keep the previous graph */
      });
    return () => {
      alive = false;
    };
  }, [run.run_id, run.updated_at, run.status, run.agent_count, run.total_tool_calls]);

  // Run span on the wall clock, for replay.
  const span = useMemo(() => {
    const starts = (data?.nodes ?? []).map((n) => n.startedAt).filter((x): x is number => !!x);
    const ends = (data?.nodes ?? []).map((n) => n.endedAt).filter((x): x is number => !!x);
    const t0 = starts.length ? Math.min(...starts) : 0;
    const t1 = Math.max(t0, ...ends, ...starts);
    return { t0, len: Math.max(1, t1 - t0) };
  }, [data]);

  // Advance the replay clock once per frame while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setPlayT((p) => {
        const next = Math.min(span.len, (p ?? 0) + (dt * span.len * speed) / PLAY_MS);
        if (next >= span.len) {
          // Finished: drop back to the final state (everyone at their desk).
          setPlaying(false);
          return null;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, span.len, speed]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  if (!data || data.nodes.length === 0) return null;

  const replaying = playT != null;
  const now = span.t0 + (playT ?? span.len);

  /** State an actor is in at the replay clock (or its real state outside replay). */
  const stateOf = (n: GraphNode): "pending" | "running" | "done" | "error" => {
    if (replaying) {
      if (n.startedAt != null && now < n.startedAt) return "pending";
      if (n.endedAt != null && now < n.endedAt) return "running";
    }
    if (isRunning(n.state)) return "running";
    return isError(n.state) ? "error" : "done";
  };

  /** Tool call an actor is on at the replay clock (its latest one outside replay). */
  const toolOf = (n: GraphNode) => {
    const tools = replaying ? n.tools.filter((x) => x.at == null || x.at <= now) : n.tools;
    return tools[tools.length - 1];
  };

  // Layout: column from the server, row = order within the column.
  const rows = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of data.nodes) {
    const r = rows.get(n.column) ?? 0;
    rows.set(n.column, r + 1);
    pos.set(n.id, { x: PAD + n.column * COL_STEP, y: HEADER + BUBBLE + PAD + r * ROW_STEP });
  }
  const maxRows = Math.max(...rows.values());
  const width = PAD * 2 + (data.columns.length - 1) * COL_STEP + NODE_W + 44;
  const height = HEADER + BUBBLE + PAD * 2 + maxRows * ROW_STEP - 30;
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const hue = (col: number) => PHASE_HEX[col % PHASE_HEX.length] as string;
  const states = new Map(data.nodes.map((n) => [n.id, stateOf(n)]));
  const linked = (id: string) =>
    !focus ||
    id === focus ||
    data.edges.some((e) => (e.from === focus && e.to === id) || (e.to === focus && e.from === id));

  /** Anchor the card beside `el`, flipping to its left when there is no room. */
  const place = (el: Element) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const right = r.right - box.left + 8;
    const left = right + 320 <= box.width ? right : Math.max(0, r.left - box.left - 328);
    setTip({ left, top: r.top - box.top });
  };

  const startReplay = () => {
    setPinned(null);
    setPlayT((p) => (p == null || p >= span.len ? 0 : p));
    setPlaying(true);
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:text-gray-100 hover:bg-surface-4 transition-colors";

  const stage = (
    <div
      className={
        full
          ? "fixed inset-0 z-[200] bg-surface-0 p-6 overflow-auto flex flex-col justify-center gap-3"
          : "space-y-2"
      }
    >
      <div className="flex items-center gap-3 flex-wrap text-[10px] uppercase tracking-wider text-gray-600">
        <span className="flex items-center gap-1 font-medium">
          <Share2 className="w-3 h-3" />
          {t("runs.graph.title")}
          <span className="text-gray-700">· {data.edges.length}</span>
        </span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <svg width="22" height="6">
            <line x1="0" y1="3" x2="22" y2="3" stroke="#38bdf8" strokeWidth="2" />
          </svg>
          {t("runs.graph.file")}
        </span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <svg width="22" height="6">
            <line
              x1="0"
              y1="3"
              x2="22"
              y2="3"
              stroke="#c084fc"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
          </svg>
          {t("runs.graph.result")}
        </span>
        <span className="normal-case tracking-normal text-gray-700">{t("runs.graph.hint")}</span>
      </div>

      {/* Replay controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {(
            [
              ["graph", Share2, t("runs.graph.viewGraph")],
              ["office", Armchair, t("runs.graph.viewOffice")],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold ${
                view === key
                  ? "bg-accent text-white"
                  : "bg-surface-1 text-gray-400 hover:bg-surface-4"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        {playing ? (
          <button className={btn} onClick={() => setPlaying(false)}>
            <Pause className="w-3.5 h-3.5" />
            {t("runs.graph.pause")}
          </button>
        ) : (
          <button className={`${btn} !text-accent !border-accent/40`} onClick={startReplay}>
            <Play className="w-3.5 h-3.5" />
            {t("runs.graph.replay")}
          </button>
        )}
        {replaying && (
          <button
            className={btn}
            onClick={() => {
              setPlaying(false);
              setPlayT(null);
            }}
            title={t("runs.graph.restart")}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <input
          type="range"
          min={0}
          max={span.len}
          value={playT ?? span.len}
          onChange={(e) => {
            setPlaying(false);
            setPlayT(Number(e.target.value));
          }}
          className="flex-1 min-w-[140px] accent-[rgb(var(--accent))]"
          aria-label={t("runs.graph.replay")}
        />
        <span className="font-mono text-[11px] text-gray-400 tabular-nums">
          {clock(playT ?? span.len)} / {clock(span.len)}
        </span>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-1.5 py-1 text-[10px] font-semibold ${
                speed === s
                  ? "bg-accent text-white"
                  : "bg-surface-1 text-gray-400 hover:bg-surface-4"
              }`}
              title={t("runs.graph.speed")}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          className={btn}
          onClick={() => setFull((f) => !f)}
          title={full ? t("runs.graph.exitFullscreen") : t("runs.graph.fullscreen")}
          aria-label={full ? t("runs.graph.exitFullscreen") : t("runs.graph.fullscreen")}
        >
          {full ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {data.edges.length === 0 && (
        <p className="text-[11px] text-gray-600">{t("runs.graph.empty")}</p>
      )}
      <div ref={wrapRef} className="relative">
        {view === "office" ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-2 p-2">
            <WorkflowOffice
              data={data}
              runId={run.run_id}
              now={now}
              walkMs={(span.len * WALK_REAL_MS) / PLAY_MS}
              settled={!replaying && run.status !== "running"}
              phaseHex={PHASE_HEX}
              stateOf={stateOf}
              toolOf={toolOf}
              focus={focus}
              reduceMotion={reduceMotion}
              resultLabel={t("runs.graph.result")}
              onEnter={(id, el) => {
                setHover(id);
                if (!pinned) place(el);
              }}
              onLeave={() => setHover(null)}
              onPick={(id, el) => {
                if (pinned === id) return setPinned(null);
                setPinned(id);
                place(el);
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-2">
            <svg
              onClick={(ev) => {
                if (ev.target === ev.currentTarget) setPinned(null);
              }}
              viewBox={`0 0 ${width} ${height}`}
              width="100%"
              style={full ? undefined : { maxWidth: width, minWidth: Math.round(width * 0.8) }}
              role="img"
              aria-label={t("runs.graph.title")}
            >
              <defs>
                {PHASE_HEX.map((h, i) => (
                  <marker
                    key={h}
                    id={`wf-arrow-${i}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill={h} />
                  </marker>
                ))}
                <filter id="wf-shadow" x="-20%" y="-20%" width="140%" height="160%">
                  <feDropShadow
                    dx="0"
                    dy="2"
                    stdDeviation="3"
                    floodColor="#0f172a"
                    floodOpacity="0.12"
                  />
                </filter>
                <filter id="wf-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Phase lanes */}
              {data.columns.map((c, i) => {
                const x = PAD + i * COL_STEP - 12;
                const h = hue(i);
                const title = c.title ? clip(c.title, 18) : `#${i + 1}`;
                return (
                  <g key={c.key}>
                    <rect
                      x={x}
                      y={10}
                      width={NODE_W + 24}
                      height={height - 20}
                      rx={16}
                      fill={h}
                      fillOpacity={0.05}
                      stroke={h}
                      strokeOpacity={0.18}
                      strokeDasharray="4 4"
                    />
                    <g transform={`translate(${x + (NODE_W + 24) / 2},${28})`}>
                      <rect
                        x={-(title.length * 3.6 + 26)}
                        y={-11}
                        width={title.length * 7.2 + 52}
                        height={22}
                        rx={11}
                        fill={h}
                        fillOpacity={0.14}
                      />
                      <circle cx={-(title.length * 3.6 + 13)} cy={0} r={8} fill={h} />
                      <text
                        x={-(title.length * 3.6 + 13)}
                        y={3.5}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="800"
                        fill="#fff"
                      >
                        {i + 1}
                      </text>
                      <text x={6} y={4} textAnchor="middle" fontSize="11" fontWeight="700" fill={h}>
                        {title}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Hand-offs */}
              {data.edges.map((e, i) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                const src = nodeById.get(e.from);
                const dst = nodeById.get(e.to);
                if (!a || !b || !src || !dst) return null;
                const dstState = states.get(e.to);
                if (dstState === "pending") return null; // not handed over yet
                const same = a.x === b.x;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = same ? b.x + NODE_W : b.x;
                const y2 = b.y + NODE_H / 2;
                const d = same
                  ? `M${x1},${y1} C${x1 + 40},${y1} ${x2 + 40},${y2} ${x2 + 2},${y2}`
                  : `M${x1},${y1} C${x1 + 44},${y1} ${x2 - 44},${y2} ${x2 - 2},${y2}`;
                const on = !focus || e.from === focus || e.to === focus;
                const hot = (focus && on) || dstState === "running";
                const flowing = !reduceMotion && (hot || !replaying);
                const gid = `wf-edge-${run.run_id}-${i}`;
                const label = e.kind === "file" ? e.files.join(", ") : t("runs.graph.result");
                return (
                  <g key={`${e.from}>${e.to}>${e.kind}`} opacity={on ? 1 : 0.07}>
                    <linearGradient
                      id={gid}
                      gradientUnits="userSpaceOnUse"
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                    >
                      <stop offset="0%" stopColor={hue(src.column)} />
                      <stop offset="100%" stopColor={hue(dst.column)} />
                    </linearGradient>
                    <path
                      d={d}
                      fill="none"
                      stroke={`url(#${gid})`}
                      strokeWidth={hot ? 2.4 : 1.5}
                      strokeOpacity={hot ? 0.95 : 0.6}
                      strokeDasharray={e.kind === "result" ? "6 4" : undefined}
                      markerEnd={`url(#wf-arrow-${dst.column % PHASE_HEX.length})`}
                    >
                      <title>{`${src.label || src.id} → ${dst.label || dst.id}: ${label}`}</title>
                    </path>
                    {flowing && (
                      <circle
                        r={hot ? 3.4 : 2.4}
                        fill={hue(dst.column)}
                        filter={hot ? "url(#wf-glow)" : undefined}
                        opacity={hot ? 1 : 0.7}
                      >
                        <animateMotion
                          dur={hot ? "1.3s" : "3.2s"}
                          repeatCount="indefinite"
                          begin={`-${((i * 0.53) % 3).toFixed(2)}s`}
                          path={d}
                        />
                      </circle>
                    )}
                    {focus && on && e.kind === "file" && (
                      <text
                        x={same ? x1 + 34 : (x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 5}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={hue(dst.column)}
                        stroke="rgb(var(--surface-2))"
                        strokeWidth="4"
                        paintOrder="stroke"
                      >
                        {clip(label, 30)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Actors */}
              {data.nodes.map((n) => {
                const p = pos.get(n.id);
                if (!p) return null;
                const h = hue(n.column);
                const st = states.get(n.id) ?? "done";
                const Icon = roleIcon(n.label);
                const working = st === "running";
                const elapsed =
                  n.startedAt && n.endedAt
                    ? formatMs((replaying ? Math.min(now, n.endedAt) : n.endedAt) - n.startedAt)
                    : "…";
                const tool = working ? toolOf(n) : undefined;
                const bubble = tool ? clip(`${tool.name}: ${tool.summary}`, 34) : null;
                const ring = working ? RUNNING : st === "error" ? "#ef4444" : h;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x},${p.y})`}
                    opacity={st === "pending" ? 0.16 : linked(n.id) ? 1 : 0.22}
                    onMouseEnter={(ev) => {
                      setHover(n.id);
                      if (!pinned) place(ev.currentTarget);
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={(ev) => {
                      if (pinned === n.id) return setPinned(null);
                      setPinned(n.id);
                      place(ev.currentTarget);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <g className={st === "pending" ? undefined : "wf-pop"}>
                      {/* Card */}
                      <rect
                        width={NODE_W}
                        height={NODE_H}
                        rx={14}
                        fill="rgb(var(--surface-1))"
                        stroke={working ? RUNNING : h}
                        strokeOpacity={working ? 0.9 : 0.45}
                        strokeWidth={working ? 1.6 : 1}
                        strokeDasharray={st === "pending" ? "4 3" : undefined}
                        filter="url(#wf-shadow)"
                      />
                      <rect width={NODE_W} height={NODE_H} rx={14} fill={h} fillOpacity={0.07} />

                      {/* Avatar */}
                      {working && !reduceMotion && (
                        <circle cx={AV_X} cy={AV_Y} r={20} fill={RUNNING} opacity={0.35}>
                          <animate
                            attributeName="r"
                            values="19;27;19"
                            dur="1.6s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.45;0;0.45"
                            dur="1.6s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                      <circle cx={AV_X} cy={AV_Y} r={19} fill="rgb(var(--surface-1))" />
                      <circle cx={AV_X} cy={AV_Y} r={19} fill={h} fillOpacity={0.16} />
                      <circle
                        cx={AV_X}
                        cy={AV_Y}
                        r={21.5}
                        fill="none"
                        stroke={ring}
                        strokeWidth={2}
                        strokeDasharray={working ? "7 5" : undefined}
                        strokeLinecap="round"
                      >
                        {working && !reduceMotion && (
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from={`0 ${AV_X} ${AV_Y}`}
                            to={`360 ${AV_X} ${AV_Y}`}
                            dur="2.4s"
                            repeatCount="indefinite"
                          />
                        )}
                      </circle>
                      <Icon
                        x={AV_X - 9}
                        y={AV_Y - 9}
                        width={18}
                        height={18}
                        color={h}
                        strokeWidth={2.2}
                      />
                      {st === "done" && (
                        <g transform={`translate(${AV_X + 14},${AV_Y + 14})`}>
                          <circle
                            r={7}
                            fill="#10b981"
                            stroke="rgb(var(--surface-1))"
                            strokeWidth={2}
                          />
                          <path
                            d="M-3,0 L-1,2.2 L3,-2"
                            fill="none"
                            stroke="#fff"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      )}
                      {st === "error" && (
                        <g transform={`translate(${AV_X + 14},${AV_Y + 14})`}>
                          <circle
                            r={7}
                            fill="#ef4444"
                            stroke="rgb(var(--surface-1))"
                            strokeWidth={2}
                          />
                          <text
                            y={3.5}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight="800"
                            fill="#fff"
                          >
                            !
                          </text>
                        </g>
                      )}

                      {/* Name + stats */}
                      <text
                        x={60}
                        y={25}
                        fontSize="12.5"
                        fontWeight="700"
                        fill="rgb(var(--gray-100))"
                      >
                        {clip(n.label || n.id.slice(0, 10), 18)}
                      </text>
                      <text x={60} y={43} fontSize="10" fill="rgb(var(--gray-400))">
                        {`${elapsed} · ${fmt(n.tokens)} tok · ${n.toolCalls} tool`}
                      </text>
                    </g>

                    {/* Speech bubble: what a working actor is doing right now */}
                    {bubble && (
                      <g transform={`translate(${44},${-22})`}>
                        <g className="wf-pop">
                          <rect
                            width={bubble.length * 5.7 + 16}
                            height={19}
                            rx={9.5}
                            fill={RUNNING}
                            filter="url(#wf-shadow)"
                          />
                          <path d="M10,18 L14,25 L19,18 z" fill={RUNNING} />
                          <text x={8} y={13} fontSize="10" fontWeight="600" fill="#1f2937">
                            {bubble}
                          </text>
                        </g>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        {focus && tip && nodeById.get(focus) && !playing && (
          <NodeCard
            node={nodeById.get(focus)!}
            data={data}
            pinned={pinned === focus}
            style={{ left: tip.left, top: tip.top }}
          />
        )}
      </div>
    </div>
  );
  // Full screen escapes the page's stacking contexts so nothing shows through.
  return full ? createPortal(stage, document.body) : stage;
}

/** Hover/pinned detail card for one agent. */
function NodeCard({
  node,
  data,
  pinned,
  style,
}: {
  node: GraphNode;
  data: WorkflowInteractions;
  pinned: boolean;
  style: CSSProperties;
}) {
  const { t } = useTranslation("workflows");
  const label = (id: string) => data.nodes.find((n) => n.id === id)?.label || id.slice(0, 10);
  const what = (e: GraphEdge) => (e.kind === "file" ? e.files.join(", ") : t("runs.graph.result"));
  const color = (e: GraphEdge) => (e.kind === "file" ? "#38bdf8" : "#c084fc");
  const incoming = data.edges.filter((e) => e.to === node.id);
  const outgoing = data.edges.filter((e) => e.from === node.id);
  const failed = node.tools.filter((x) => x.error).length;
  const row = "flex gap-2 text-[11px] leading-snug";
  const head = "text-[10px] uppercase tracking-wider text-gray-500 mb-0.5";
  const dot = isRunning(node.state) ? RUNNING : isError(node.state) ? "#ef4444" : "#10b981";
  return (
    <div
      className={`absolute z-20 w-80 rounded-xl border bg-surface-1/95 p-3 shadow-xl space-y-2 ${
        pinned ? "border-accent/60" : "border-border pointer-events-none"
      }`}
      style={style}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <span className="text-xs font-semibold text-gray-100">{node.label || node.id}</span>
        <span className="ml-auto text-[10px] text-gray-500">
          {node.phase || ""}
          {node.startedAt && node.endedAt ? ` · ${formatMs(node.endedAt - node.startedAt)}` : ""}
        </span>
      </div>
      {incoming.length > 0 && (
        <div>
          <div className={head}>{t("runs.graph.received")}</div>
          {incoming.map((e) => (
            <div key={`${e.from}${e.kind}`} className={row}>
              <span className="text-gray-300">← {label(e.from)}</span>
              <span style={{ color: color(e) }}>{what(e)}</span>
            </div>
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div>
          <div className={head}>{t("runs.graph.sent")}</div>
          {outgoing.map((e) => (
            <div key={`${e.to}${e.kind}`} className={row}>
              <span className="text-gray-300">→ {label(e.to)}</span>
              <span style={{ color: color(e) }}>{what(e)}</span>
            </div>
          ))}
        </div>
      )}
      {node.writes.length > 0 && (
        <div>
          <div className={head}>{t("runs.graph.wrote")}</div>
          <div className="text-[11px] font-mono text-sky-300">{node.writes.join(", ")}</div>
        </div>
      )}
      <div>
        <div className={head}>
          {t("runs.graph.tools", { count: node.tools.length })}
          {failed > 0 && <span className="ml-1 text-red-400">· {failed} ✗</span>}
        </div>
        <ol
          className={`space-y-0.5 ${pinned ? "max-h-56 overflow-auto" : "max-h-40 overflow-hidden"}`}
        >
          {node.tools.map((x, i) => (
            <li key={i} className={row}>
              <span className="w-4 shrink-0 text-right text-gray-600">{i + 1}</span>
              <span
                className={`shrink-0 font-mono ${x.error ? "text-red-400" : "text-violet-300"}`}
              >
                {x.error ? "✗ " : ""}
                {x.name}
              </span>
              <span className="min-w-0 truncate text-gray-400" title={x.summary}>
                {x.summary}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {node.result && (
        <div>
          <div className={head}>{t("runs.graph.resultPreview")}</div>
          <p className="text-[11px] text-gray-400 line-clamp-4 break-words">{node.result}</p>
        </div>
      )}
      {!pinned && <div className="text-[10px] text-gray-600">{t("runs.graph.pinHint")}</div>}
    </div>
  );
}
