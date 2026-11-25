/**
 * @file commandCenter.ts
 * @description Pure rules behind the command centre (the home page where you
 * give agents work): which project folders the composer may run in and when it
 * must send you to connect an account first, which account warnings to show,
 * how runs fall into the agent inbox (needs you / working / finished), the
 * trust levels behind the permission modes, ticket keys typed into a prompt,
 * and how a run's stream folds into chat bubbles and tool groups. Kept free of
 * React so each rule is tested on its own.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import type {
  ConnectionItem,
  ConnectionsResponse,
  CwdSuggestion,
  DashboardRunHistoryItem,
  PermissionMode,
  ProjectItem,
  ProjectsResponse,
  RunHandle,
  RunProgress,
  RunProvider,
  RunStatus,
} from "./api";
import type { Session } from "./types";

// ── Trust levels ─────────────────────────────────────────────────────────────

/** How far an agent may go on its own: look only, edit files, or run anything. */
export type TrustLevel = "read" | "edit" | "full";

/** Claude `--permission-mode` behind each trust level. */
export const TRUST_PERMISSION: Record<TrustLevel, PermissionMode> = {
  read: "plan",
  edit: "acceptEdits",
  full: "bypassPermissions",
};

/** Trust levels in the order the dial shows them. */
export const TRUST_LEVELS: readonly TrustLevel[] = ["read", "edit", "full"];

/**
 * The trust level a permission mode stands for, or null for one the dial has no position for
 * (`default`, or a Codex approval policy).
 */
export function trustFromPermission(mode: string | null | undefined): TrustLevel | null {
  const found = TRUST_LEVELS.find((level) => TRUST_PERMISSION[level] === mode);
  return found ?? null;
}

// ── Where a run may start ────────────────────────────────────────────────────

/** One folder the composer offers as a place to run. */
export interface WorkspaceChoice {
  /** Absolute folder the agent runs in. */
  path: string;
  /** Short name shown on the picker. */
  label: string;
  /** Catalog project id, when the choice is a project. */
  projectId?: string;
}

/**
 * What the composer's place picker may offer:
 * - `loading`: the project catalog has not answered yet.
 * - `free`: no catalog (plain local use, or a catalog that reports no folders): any folder.
 * - `connect`: the catalog needs an account that is not signed in; running is blocked.
 * - `noProjects`: signed in, but no project is in the workspace yet; running is blocked.
 * - `projects`: only these project folders may be chosen.
 */
export type WorkspaceGate =
  | { kind: "loading" }
  | { kind: "free"; catalogError: string | null }
  | { kind: "connect"; connection: { id: string; name: string } }
  | { kind: "noProjects" }
  | { kind: "projects"; choices: WorkspaceChoice[] };

/**
 * Decide what the place picker offers from the project catalog. Only fully fetched projects with a
 * folder are offered; a project still being fetched or fetched in part is left out. A catalog that
 * fails to list, or that lists fetched projects without any folder (an older catalog command),
 * falls back to a free choice so nobody is locked out by it.
 *
 * @param catalog - `GET /api/projects`, or null while it loads.
 * @param loadError - Error from loading it, if any.
 */
export function workspaceGate(
  catalog: ProjectsResponse | null,
  loadError: string | null
): WorkspaceGate {
  if (loadError) return { kind: "free", catalogError: loadError };
  if (!catalog) return { kind: "loading" };
  if (!catalog.enabled) return { kind: "free", catalogError: null };
  if (catalog.error) return { kind: "free", catalogError: catalog.error };
  if (catalog.requires && !catalog.requires.connected) {
    return {
      kind: "connect",
      connection: { id: catalog.requires.id, name: catalog.requires.name },
    };
  }
  const cloned = catalog.items.filter((item) => item.cloned);
  const choices = cloned
    .filter((item): item is ProjectItem & { path: string } => typeof item.path === "string")
    .map((item) => ({ path: item.path, label: item.name, projectId: item.id }));
  if (choices.length > 0) return { kind: "projects", choices };
  if (cloned.length > 0) return { kind: "free", catalogError: null };
  return { kind: "noProjects" };
}

/**
 * Folder choices for a free pick: the home folder first, then recently used folders. The
 * dashboard's own folder is left out, since running there loads this repo's agent settings
 * (issue #202).
 */
export function freeChoices(suggestions: CwdSuggestion[]): WorkspaceChoice[] {
  const order = { home: 0, recent: 1, dashboard: 2 } as const;
  return suggestions
    .filter((s) => s.kind !== "dashboard")
    .slice()
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((s) => ({ path: s.path, label: s.label }));
}

/**
 * The folder to preselect: the remembered one when it is still offered, else the first choice.
 *
 * @param choices - Folders on offer.
 * @param remembered - Folder used last time, if any.
 */
export function pickWorkspace(
  choices: WorkspaceChoice[],
  remembered: string | null
): WorkspaceChoice | null {
  return choices.find((c) => c.path === remembered) ?? choices[0] ?? null;
}

// ── Account warnings ─────────────────────────────────────────────────────────

/**
 * Accounts to warn about above the composer: every connection whose check says it is not signed
 * in, except the one the workspace gate already blocks on and ones dismissed for this visit.
 *
 * @param connections - `GET /api/connections` with statuses, or null while it loads.
 * @param gateConnectionId - Connection the workspace gate is blocking on, if any.
 * @param dismissed - Connection ids the user put off for now.
 */
export function connectionWarnings(
  connections: ConnectionsResponse | null,
  gateConnectionId: string | null,
  dismissed: ReadonlySet<string>
): ConnectionItem[] {
  if (!connections?.enabled || connections.error) return [];
  return connections.items.filter(
    (item) =>
      item.status?.connected === false && item.id !== gateConnectionId && !dismissed.has(item.id)
  );
}

// ── Agent inbox ──────────────────────────────────────────────────────────────

/** Inbox sections, in the order they are shown. */
export type InboxGroup = "needsYou" | "working" | "finished";

/** One run as the inbox lists it, from a live handle or a history row. */
export interface InboxItem {
  id: string;
  group: InboxGroup;
  provider: RunProvider;
  status: RunStatus;
  /** First line of the prompt; empty for a resumed conversation started without one. */
  title: string;
  cwd: string;
  model: string | null;
  permissionMode: string | null;
  sessionId: string | null;
  mode: RunHandle["mode"];
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms, or null while the run is live. */
  endedAt: number | null;
  lastActivity: string | null;
  progress: RunProgress | null;
  /** The live handle, when the server still tracks the run. */
  handle: RunHandle | null;
}

const LIVE: ReadonlySet<RunStatus> = new Set(["spawning", "running"]);
/** Longest inbox title kept. */
const TITLE_MAX = 90;

/** First non-empty line of a prompt, shortened for a one-line title. */
export function runTitle(prompt: string | null | undefined): string {
  const line =
    (prompt ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

export interface ResumeTarget {
  sessionId: string;
  cwd: string;
  title: string;
}

export function insideFolder(cwd: string, root: string): boolean {
  const base = root.replace(/[\\/]+$/, "");
  return cwd === base || cwd.startsWith(`${base}/`) || cwd.startsWith(`${base}\\`);
}

export function resumableSessions(sessions: Session[], gate: WorkspaceGate): Session[] {
  if (gate.kind !== "free" && gate.kind !== "projects") return [];
  return sessions.filter((session) => {
    const cwd = session.cwd;
    if (!cwd) return false;
    if (session.provider && session.provider !== "claude") return false;
    if (gate.kind === "free") return true;
    return gate.choices.some((choice) => insideFolder(cwd, choice.path));
  });
}

export function sessionTitle(session: Session): string {
  return runTitle(session.name || session.prompt_preview || "");
}

function groupOf(handle: RunHandle): InboxGroup {
  if (!LIVE.has(handle.status)) return "finished";
  if (handle.mode === "conversation" && handle.status === "running") {
    if (handle.turnState === "waiting") return "needsYou";
  }
  return "working";
}

function fromHandle(handle: RunHandle): InboxItem {
  return {
    id: handle.id,
    group: groupOf(handle),
    provider: handle.provider,
    status: handle.status,
    title: runTitle(handle.prompt),
    cwd: handle.cwd,
    model: handle.model,
    permissionMode: handle.permissionMode,
    sessionId: handle.sessionId,
    mode: handle.mode,
    startedAt: handle.startedAt,
    endedAt: handle.endedAt,
    lastActivity: handle.lastActivity ?? null,
    progress: handle.progress ?? null,
    handle,
  };
}

function fromHistory(row: DashboardRunHistoryItem): InboxItem {
  const live = LIVE.has(row.status) && row.isLive;
  return {
    id: row.id,
    group: live ? "working" : "finished",
    provider: row.provider,
    status: row.status,
    title: runTitle(row.prompt_preview),
    cwd: row.cwd,
    model: row.model,
    permissionMode: row.permission_mode,
    sessionId: row.session_id,
    mode: row.mode,
    startedAt: Date.parse(row.started_at),
    endedAt: row.ended_at ? Date.parse(row.ended_at) : null,
    lastActivity: null,
    progress: null,
    handle: null,
  };
}

/**
 * Build the inbox from live handles and run history. A run in both is taken from its live handle.
 * Each section is newest first; finished runs are capped at `finishedLimit`. Runs with no live
 * handle that history still marks as running (the server restarted under them) are listed as
 * finished, since nobody can talk to them any more.
 *
 * @param live - `GET /api/run` items.
 * @param history - `GET /api/run/history` items.
 * @param finishedLimit - How many finished runs to keep.
 */
export function buildInbox(
  live: RunHandle[],
  history: DashboardRunHistoryItem[],
  finishedLimit = 8
): InboxItem[] {
  const byId = new Map<string, InboxItem>();
  for (const handle of live) byId.set(handle.id, fromHandle(handle));
  for (const row of history) {
    if (byId.has(row.id)) continue;
    const item = fromHistory(row);
    byId.set(row.id, item.group === "working" ? { ...item, group: "finished" } : item);
  }
  const all = [...byId.values()];
  const newest = (a: InboxItem, b: InboxItem) =>
    (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt);
  const section = (group: InboxGroup) => all.filter((i) => i.group === group).sort(newest);
  return [
    ...section("needsYou"),
    ...section("working"),
    ...section("finished").slice(0, finishedLimit),
  ];
}

// ── Ticket keys ──────────────────────────────────────────────────────────────

/** Uppercase-dash-number tokens that are standards or encodings, not tickets. */
const NOT_TICKETS = new Set(["UTF", "SHA", "ISO", "RFC", "MD", "TLS", "HTTP", "ES", "CVE"]);
/** A Jira-style key such as `PB2B-503`. */
const TICKET_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g;

/**
 * Jira-style ticket keys in a prompt, in order of first appearance, at most `limit`.
 *
 * @param text - Prompt text.
 * @param limit - Most keys to return.
 */
export function ticketKeys(text: string, limit = 3): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(TICKET_RE)) {
    const prefix = match[1] ?? "";
    const key = `${prefix}-${match[2] ?? ""}`;
    if (NOT_TICKETS.has(prefix) || found.includes(key)) continue;
    found.push(key);
    if (found.length >= limit) break;
  }
  return found;
}

// ── Conversation view ────────────────────────────────────────────────────────

/** One tool call inside a folded tool group. */
export interface ToolCall {
  name: string;
  detail: string;
}

/** What the conversation pane draws, in order. */
export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming: boolean }
  | { kind: "tools"; calls: ToolCall[] };

/** Tool input fields that best say what a call is about, most telling first. */
const DETAIL_FIELDS = [
  "file_path",
  "notebook_path",
  "path",
  "command",
  "pattern",
  "url",
  "query",
  "skill",
  "description",
];
const DETAIL_MAX = 120;

/** The part of a tool call worth showing, e.g. the file an Edit touches. */
export function toolDetail(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  for (const key of DETAIL_FIELDS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      const line = value.trim().split("\n")[0] ?? "";
      return line.length > DETAIL_MAX ? `${line.slice(0, DETAIL_MAX - 1)}…` : line;
    }
  }
  return "";
}

type Block = { type?: unknown; text?: unknown; name?: unknown; input?: unknown };

function blocksOf(content: unknown): Block[] {
  return Array.isArray(content) ? (content as Block[]) : [];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return blocksOf(content)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

/**
 * Fold a Claude run's stream into chat items: your messages, the agent's replies, and each run of
 * consecutive tool calls as one group. Tool results, thinking, system and result envelopes are
 * left out; the full detail stays on the session page.
 *
 * @param envelopes - Envelopes as the Run page merges them (streaming deltas already folded in).
 */
export function chatItems(envelopes: readonly unknown[]): ChatItem[] {
  const out: ChatItem[] = [];
  const pushTool = (call: ToolCall) => {
    const last = out[out.length - 1];
    if (last?.kind === "tools") last.calls.push(call);
    else out.push({ kind: "tools", calls: [call] });
  };
  for (const raw of envelopes) {
    if (!raw || typeof raw !== "object") continue;
    const env = raw as {
      type?: unknown;
      message?: { content?: unknown; _streaming?: unknown };
    };
    if (env.type === "user") {
      const text = textOf(env.message?.content).trim();
      if (text) out.push({ kind: "user", text });
      continue;
    }
    if (env.type !== "assistant") continue;
    // The Run page's stream merger marks a message still being typed with `_streaming`.
    const streaming = env.message?._streaming === true;
    for (const block of blocksOf(env.message?.content)) {
      if (block.type === "tool_use" && typeof block.name === "string") {
        pushTool({ name: block.name, detail: toolDetail(block.input) });
      } else if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        out.push({ kind: "assistant", text: block.text, streaming });
      }
    }
  }
  return out;
}

/**
 * Tool names in a group with how often each was called, most used first, e.g. `Read ×3`.
 *
 * @param calls - The group's calls.
 */
export function toolTally(calls: readonly ToolCall[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const call of calls) counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The terminal command that reopens a session in Claude Code. */
export function resumeCommand(sessionId: string): string {
  return `claude --resume ${sessionId}`;
}
