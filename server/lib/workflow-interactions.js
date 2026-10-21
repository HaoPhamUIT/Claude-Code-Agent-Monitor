/**
 * @file workflow-interactions.js
 * @description Builds the agent-interaction graph for one Workflow-tool run.
 * Inner agents never message each other; they interact through artifacts the
 * script hands along. Two kinds of hand-off are recovered from disk:
 *   - file:   agent A writes a file, a later agent B mentions/reads it
 *             (Write/Edit/Read tool inputs, shell redirections, or B's prompt)
 *   - result: a later agent B's prompt embeds text from agent A's result
 *             (the script passed A's return value into B's task)
 * Nodes come from the run's progress[] (journal or live ingest), so the graph
 * works for running and completed runs alike.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("fs");
const path = require("path");

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// `> f`, `>> f`, `cat > f`, `tee [-a] f`, Python `open('f', 'w')`.
// ponytail: regex over shell text; misses cp/mv/sed -i writes, add if needed.
const SHELL_WRITE_RES = [
  /(?:^|[\s;&|(])>{1,2}\s*['"]?([^\s'";|&<>()]+)/g,
  /\btee\s+(?:-a\s+)?['"]?([^\s'";|&<>()]+)/g,
  /\bopen\(\s*['"]([^'"]+)['"]\s*,\s*['"][wax]/g,
];

function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Text blocks of a transcript message (string or block-array content). */
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n");
}

/** One-line description of a tool call for the hover panel. */
function toolSummary(name, input) {
  const file = input.file_path || input.notebook_path;
  let s =
    name === "Bash"
      ? input.description || String(input.command || "").split("\n")[0]
      : file
        ? path.basename(file)
        : input.pattern ||
          input.description ||
          Object.values(input).find((v) => typeof v === "string") ||
          "";
  // Drop the `cd <dir> &&` preamble and shorten absolute paths to basenames.
  s = String(s)
    .replace(/^\s*cd\s+\S+\s*&&\s*/, "")
    .replace(/(?:\/[^\s/'"`]+)+\/([^\s/'"`]+)/g, "$1")
    .trim();
  return s.length > 90 ? s.slice(0, 89) + "…" : s;
}

/**
 * Read one inner-agent transcript into prompt text, timestamped tool inputs and
 * the files it wrote. Missing/partial files yield empty data (never throws).
 */
function readAgentTranscript(file) {
  const out = { prompt: "", promptAt: null, endAt: null, mentions: [], writes: [], tools: [] };
  const toolById = new Map(); // tool_use_id → tools[] entry, to mark failures
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const at = toMs(o.timestamp);
    if (at != null) out.endAt = at;
    const msg = o.message || {};
    if (o.type === "user") {
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b && b.type === "tool_result" && b.is_error && toolById.has(b.tool_use_id)) {
            toolById.get(b.tool_use_id).error = true;
          }
        }
      }
      const t = textOf(msg.content);
      if (t) {
        out.prompt += t + "\n";
        if (out.promptAt == null) out.promptAt = at;
      }
      continue;
    }
    if (o.type !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const b of msg.content) {
      if (!b || b.type !== "tool_use" || !b.input) continue;
      const input = b.input;
      const text = JSON.stringify(input);
      out.mentions.push({ at, text });
      const tool = { name: b.name, summary: toolSummary(b.name, input), at, error: false };
      out.tools.push(tool);
      if (b.id) toolById.set(b.id, tool);
      if (WRITE_TOOLS.has(b.name) && (input.file_path || input.notebook_path)) {
        out.writes.push({ at, file: path.basename(input.file_path || input.notebook_path) });
      } else if (b.name === "Bash" && typeof input.command === "string") {
        for (const re of SHELL_WRITE_RES) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(input.command))) {
            const f = path.basename(m[1]);
            if (f && !m[1].startsWith("/dev/") && /\w\.\w/.test(f))
              out.writes.push({ at, file: f });
          }
        }
      }
    }
  }
  return out;
}

/** Results recorded in the run's streaming journal.jsonl, keyed by agentId. */
function readResults(runDir) {
  const results = new Map();
  let raw = "";
  try {
    raw = fs.readFileSync(path.join(runDir, "journal.jsonl"), "utf8");
  } catch {
    return results;
  }
  for (const line of raw.split("\n")) {
    try {
      const o = JSON.parse(line);
      if (o && o.type === "result" && o.agentId) results.set(o.agentId, o.result);
    } catch {
      /* skip partial line */
    }
  }
  return results;
}

/**
 * Comparable form of free text: JSON escapes undone, paths dropped (every agent
 * of a run shares the same working-dir paths, so they prove nothing), spaces
 * collapsed.
 */
function norm(s) {
  return s
    .replace(/\\[nt]/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\S*\/\S*/g, " ")
    .replace(/\s+/g, " ");
}

/** Long leaf strings of a result value — the parts a script would forward. */
function resultProbes(value, acc = []) {
  if (typeof value === "string") {
    const s = norm(value).trim();
    if (s.length >= 30) acc.push(s.slice(0, 50));
  } else if (Array.isArray(value)) {
    for (const v of value) resultProbes(v, acc);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) resultProbes(v, acc);
  }
  return acc;
}

function previewOf(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 600 ? s.slice(0, 599) + "…" : s;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build { columns, nodes, edges } for a run.
 *
 * @param {object} run - hydrated workflow row (progress[] parsed).
 * @param {string} sessionDir - `<projects>/<enc-cwd>/<sessionId>` folder.
 */
function buildInteractions(run, sessionDir) {
  const runDir = path.join(sessionDir, "subagents", "workflows", run.run_id);
  const results = readResults(runDir);
  const entries = (run.progress || []).filter((p) => p && p.type === "workflow_agent" && p.agentId);

  const nodes = entries.map((e) => {
    const t = readAgentTranscript(path.join(runDir, `agent-${e.agentId}.jsonl`));
    const startedAt = toMs(e.startedAt) ?? t.promptAt;
    return {
      id: e.agentId,
      label: e.label || null,
      phase: e.phaseTitle || null,
      state: e.state || null,
      startedAt,
      endedAt: e.durationMs != null && startedAt != null ? startedAt + e.durationMs : t.endAt,
      tokens: e.tokens || 0,
      toolCalls: e.toolCalls || 0,
      tools: t.tools,
      writes: [...new Set(t.writes.map((w) => w.file))],
      result: results.has(e.agentId) ? previewOf(results.get(e.agentId)) : null,
      _t: t,
    };
  });

  // Columns: phases in first-seen start order; phase-less agents group by
  // start second so parallel launches share a column.
  const colOf = (n) => n.phase || `@${Math.round((n.startedAt || 0) / 1000)}`;
  const firstStart = new Map();
  for (const n of nodes) {
    const k = colOf(n);
    const s = n.startedAt ?? Infinity;
    if (!firstStart.has(k) || s < firstStart.get(k)) firstStart.set(k, s);
  }
  const columns = [...firstStart.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => ({ key, title: key.startsWith("@") ? null : key }));
  const colIndex = new Map(columns.map((c, i) => [c.key, i]));
  for (const n of nodes) n.column = colIndex.get(colOf(n));

  // file → writes, oldest first
  const writers = new Map();
  for (const n of nodes) {
    for (const w of n._t.writes) {
      if (!writers.has(w.file)) writers.set(w.file, []);
      writers.get(w.file).push({ node: n.id, at: w.at ?? n.startedAt ?? 0 });
    }
  }
  for (const list of writers.values()) list.sort((a, b) => a.at - b.at);

  const edges = new Map(); // `${from}>${to}>${kind}` → edge
  const addEdge = (from, to, kind, file) => {
    const key = `${from}>${to}>${kind}`;
    if (!edges.has(key)) edges.set(key, { from, to, kind, files: [] });
    if (file && !edges.get(key).files.includes(file)) edges.get(key).files.push(file);
  };

  for (const b of nodes) {
    const texts = [{ at: b.startedAt ?? b._t.promptAt ?? 0, text: b._t.prompt }, ...b._t.mentions];
    for (const [file, list] of writers) {
      const re = new RegExp(`(^|[^\\w.-])${escapeRe(file)}($|[^\\w-])`);
      const firstMention = texts
        .filter((x) => x.text && re.test(x.text))
        .reduce((min, x) => Math.min(min, x.at ?? Infinity), Infinity);
      if (firstMention === Infinity) continue;
      // Latest other-agent write before B first touched the file.
      const src = list.filter((w) => w.node !== b.id && w.at < firstMention).pop();
      if (src) addEdge(src.node, b.id, "file", file);
    }
  }

  for (const a of nodes) {
    if (!results.has(a.id)) continue;
    const probes = resultProbes(results.get(a.id));
    if (!probes.length) continue;
    for (const b of nodes) {
      if (b.id === a.id || (a.endedAt && b.startedAt && b.startedAt < a.endedAt)) continue;
      const p = (b._t.normPrompt ??= norm(b._t.prompt));
      if (probes.some((s) => p.includes(s))) addEdge(a.id, b.id, "result");
    }
  }

  for (const n of nodes) delete n._t;
  return { columns, nodes, edges: [...edges.values()] };
}

module.exports = { buildInteractions };
