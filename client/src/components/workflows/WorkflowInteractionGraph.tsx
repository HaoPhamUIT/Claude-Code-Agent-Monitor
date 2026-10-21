/**
 * @file WorkflowInteractionGraph.tsx
 * @description Agent-interaction graph for one Workflow-tool run: phases as
 * columns, inner agents as nodes, and arrows for each hand-off — a file one
 * agent wrote and a later agent read (solid) or a result the script forwarded
 * into a later agent's prompt (dashed). Refetches whenever the run row changes,
 * so a running workflow's graph grows live; arrows into a running agent animate.
 * Hovering an agent opens a detail card (hand-offs in/out, files written, tool
 * calls with failures marked, result preview); clicking pins it so it can scroll.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import { api } from "../../lib/api";
import type { WorkflowInteractions, WorkflowRun } from "../../lib/types";
import { fmt, formatMs } from "../../lib/format";

const NODE_W = 146;
const NODE_H = 46;
const COL_STEP = NODE_W + 52;
const ROW_STEP = NODE_H + 22;
const PAD = 16;
const HEADER = 26;

// Same hues, same order as WorkflowRunsPanel's PHASE_PALETTE.
const PHASE_HEX = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#f43f5e", "#06b6d4", "#d946ef"];
const EDGE_HEX = { file: "#38bdf8", result: "#c084fc" } as const;

function stateHex(state: string | null): string {
  if (state === "running" || state === "working" || state === "queued") return "#fbbf24";
  if (state === "error" || state === "failed") return "#f87171";
  return "#34d399";
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Interaction graph for `run`; renders nothing until the first fetch lands. */
export function WorkflowInteractionGraph({ run }: { run: WorkflowRun }) {
  const { t } = useTranslation("workflows");
  const [data, setData] = useState<WorkflowInteractions | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // Detail-card anchor in px, relative to `wrapRef` (the graph's outer box).
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const focus = pinned ?? hover;

  /** Anchor the card beside `el`, flipping to its left when there is no room. */
  const place = (el: Element) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const right = r.right - box.left + 8;
    const left = right + 320 <= box.width ? right : Math.max(0, r.left - box.left - 328);
    setTip({ left, top: r.top - box.top });
  };

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

  if (!data || data.nodes.length === 0) return null;

  // Layout: column from the server, row = order within the column.
  const rows = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of data.nodes) {
    const r = rows.get(n.column) ?? 0;
    rows.set(n.column, r + 1);
    pos.set(n.id, { x: PAD + n.column * COL_STEP, y: HEADER + PAD + r * ROW_STEP });
  }
  const maxRows = Math.max(...rows.values());
  const width = PAD * 2 + (data.columns.length - 1) * COL_STEP + NODE_W + 40;
  const height = HEADER + PAD * 2 + maxRows * ROW_STEP - 22;
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const linked = (id: string) =>
    !focus ||
    id === focus ||
    data.edges.some((e) => (e.from === focus && e.to === id) || (e.to === focus && e.from === id));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 flex-wrap text-[10px] uppercase tracking-wider text-gray-600">
        <span className="flex items-center gap-1 font-medium">
          <Share2 className="w-3 h-3" />
          {t("runs.graph.title")}
          <span className="text-gray-700">· {data.edges.length}</span>
        </span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <svg width="22" height="6">
            <line x1="0" y1="3" x2="22" y2="3" stroke={EDGE_HEX.file} strokeWidth="2" />
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
              stroke={EDGE_HEX.result}
              strokeWidth="2"
              strokeDasharray="5 3"
            />
          </svg>
          {t("runs.graph.result")}
        </span>
        <span className="normal-case tracking-normal text-gray-700">{t("runs.graph.hint")}</span>
      </div>
      {data.edges.length === 0 && (
        <p className="text-[11px] text-gray-600">{t("runs.graph.empty")}</p>
      )}
      <div ref={wrapRef} className="relative">
        <div className="overflow-x-auto rounded border border-gray-800/70 bg-black/20">
          <svg
            onClick={(ev) => {
              if (ev.target === ev.currentTarget) setPinned(null);
            }}
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            style={{ maxWidth: width, minWidth: Math.min(width, 640) }}
            role="img"
            aria-label={t("runs.graph.title")}
          >
            <defs>
              {(["file", "result"] as const).map((k) => (
                <marker
                  key={k}
                  id={`wf-arrow-${k}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={EDGE_HEX[k]} />
                </marker>
              ))}
            </defs>

            {data.columns.map((c, i) => (
              <text
                key={c.key}
                x={PAD + i * COL_STEP + NODE_W / 2}
                y={PAD + 8}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={PHASE_HEX[i % PHASE_HEX.length]}
              >
                {c.title ? clip(c.title, 22) : `#${i + 1}`}
              </text>
            ))}

            {data.edges.map((e) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const same = a.x === b.x;
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = same ? b.x + NODE_W : b.x;
              const y2 = b.y + NODE_H / 2;
              const d = same
                ? `M${x1},${y1} C${x1 + 36},${y1} ${x2 + 36},${y2} ${x2 + 2},${y2}`
                : `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2 - 2},${y2}`;
              const on = !focus || e.from === focus || e.to === focus;
              const label = e.kind === "file" ? e.files.join(", ") : t("runs.graph.result");
              const target = nodeById.get(e.to);
              const live = target && stateHex(target.state) === "#fbbf24";
              return (
                <g key={`${e.from}>${e.to}>${e.kind}`} opacity={on ? 1 : 0.08}>
                  <path
                    d={d}
                    fill="none"
                    stroke={EDGE_HEX[e.kind]}
                    strokeWidth={focus && on ? 2 : 1.4}
                    strokeOpacity={0.85}
                    strokeDasharray={e.kind === "result" ? "6 4" : live ? "4 4" : undefined}
                    markerEnd={`url(#wf-arrow-${e.kind})`}
                  >
                    {live && (
                      <animate
                        attributeName="stroke-dashoffset"
                        from="16"
                        to="0"
                        dur="0.8s"
                        repeatCount="indefinite"
                      />
                    )}
                    <title>{`${nodeById.get(e.from)?.label || e.from} → ${target?.label || e.to}: ${label}`}</title>
                  </path>
                  {focus && on && e.kind === "file" && (
                    <text
                      x={same ? x1 + 30 : (x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 4}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={EDGE_HEX[e.kind]}
                      stroke="#0b0b12"
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {clip(label, 30)}
                    </text>
                  )}
                </g>
              );
            })}

            {data.nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const hue = PHASE_HEX[n.column % PHASE_HEX.length];
              const st = stateHex(n.state);
              const dur = n.startedAt && n.endedAt ? formatMs(n.endedAt - n.startedAt) : "…";
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={linked(n.id) ? 1 : 0.25}
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
                  {/* Opaque base so arrows that skip a column pass under the node. */}
                  <rect width={NODE_W} height={NODE_H} rx="7" fill="#0d0d16" />
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="7"
                    fill={hue}
                    fillOpacity="0.12"
                    stroke={hue}
                    strokeOpacity="0.55"
                  />
                  <rect x="0" y="0" width="4" height={NODE_H} rx="2" fill={st}>
                    {st === "#fbbf24" && (
                      <animate
                        attributeName="opacity"
                        values="1;0.3;1"
                        dur="1.2s"
                        repeatCount="indefinite"
                      />
                    )}
                  </rect>
                  <text x="12" y="19" fontSize="11.5" fontWeight="600" fill="#e5e7eb">
                    {clip(n.label || n.id.slice(0, 10), 21)}
                  </text>
                  <text x="12" y="36" fontSize="10" fill="#9ca3af">
                    {`${dur} · ${fmt(n.tokens)} tok · ${n.toolCalls} tool`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {focus && tip && nodeById.get(focus) && (
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
}

/** Hover/pinned detail card for one agent. */
function NodeCard({
  node,
  data,
  pinned,
  style,
}: {
  node: WorkflowInteractions["nodes"][number];
  data: WorkflowInteractions;
  pinned: boolean;
  style: React.CSSProperties;
}) {
  const { t } = useTranslation("workflows");
  const label = (id: string) => data.nodes.find((n) => n.id === id)?.label || id.slice(0, 10);
  const what = (e: WorkflowInteractions["edges"][number]) =>
    e.kind === "file" ? e.files.join(", ") : t("runs.graph.result");
  const incoming = data.edges.filter((e) => e.to === node.id);
  const outgoing = data.edges.filter((e) => e.from === node.id);
  const failed = node.tools.filter((x) => x.error).length;
  const row = "flex gap-2 text-[11px] leading-snug";
  const head = "text-[10px] uppercase tracking-wider text-gray-500 mb-0.5";
  return (
    <div
      className={`absolute z-20 w-80 rounded-lg border bg-[#0d0d16]/95 p-3 shadow-xl space-y-2 ${
        pinned ? "border-violet-500/60" : "border-gray-700 pointer-events-none"
      }`}
      style={style}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: stateHex(node.state) }} />
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
              <span style={{ color: EDGE_HEX[e.kind] }}>{what(e)}</span>
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
              <span style={{ color: EDGE_HEX[e.kind] }}>{what(e)}</span>
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
