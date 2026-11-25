/**
 * @file Tests for the command centre rules: the place picker only offers
 * fetched project folders and blocks until the catalog's account is signed in,
 * account warnings skip the blocking one and dismissed ones, runs fall into the
 * right inbox section, ticket keys are found without standards like UTF-8, and
 * a run's stream folds into chat bubbles and tool groups.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, expect, it } from "vitest";
import type {
  ConnectionItem,
  ConnectionsResponse,
  DashboardRunHistoryItem,
  ProjectItem,
  ProjectsResponse,
  RunHandle,
} from "../api";
import type { Session } from "../types";
import {
  buildInbox,
  chatItems,
  connectionWarnings,
  freeChoices,
  insideFolder,
  pickWorkspace,
  resumableSessions,
  runTitle,
  sessionTitle,
  ticketKeys,
  toolTally,
  trustFromPermission,
  workspaceGate,
} from "../commandCenter";

function project(over: Partial<ProjectItem> = {}): ProjectItem {
  return {
    id: "b2b-web",
    name: "b2b-web",
    description: "",
    cloned: true,
    partial: false,
    path: "/home/u/workspace/b2b-web",
    job: null,
    ...over,
  };
}

function catalog(over: Partial<ProjectsResponse> = {}): ProjectsResponse {
  return {
    enabled: true,
    error: null,
    requires: { id: "azure-devops", name: "Azure DevOps", connected: true },
    items: [project()],
    ...over,
  };
}

function handle(over: Partial<RunHandle> = {}): RunHandle {
  return {
    id: "run-1",
    provider: "claude",
    pid: 1,
    mode: "conversation",
    cwd: "/w/a",
    model: null,
    permissionMode: "acceptEdits",
    effort: null,
    prompt: "Review PR 1482\nfocus on schema",
    argv: [],
    resumeSessionId: null,
    status: "running",
    startedAt: 1_000,
    endedAt: null,
    exitCode: null,
    signal: null,
    error: null,
    sessionId: "s-1",
    envelopeCount: 0,
    stdoutTail: "",
    stderrTail: "",
    turnState: "working",
    lastActivity: null,
    progress: null,
    ...over,
  };
}

function historyRow(over: Partial<DashboardRunHistoryItem> = {}): DashboardRunHistoryItem {
  return {
    id: "old-1",
    provider: "claude",
    session_id: "s-old",
    mode: "conversation",
    cwd: "/w/b",
    model: null,
    permission_mode: "acceptEdits",
    sandbox: null,
    effort: null,
    resume_session_id: null,
    prompt_preview: "Write tests for cart",
    status: "completed",
    exit_code: 0,
    started_at: "2026-11-25T10:00:00.000Z",
    ended_at: "2026-11-25T10:05:00.000Z",
    isLive: false,
    ...over,
  };
}

function connection(over: Partial<ConnectionItem> = {}): ConnectionItem {
  return {
    id: "atlassian",
    name: "Atlassian",
    description: "",
    canLogout: true,
    required: false,
    status: { connected: false, account: "", detail: "" },
    job: null,
    ...over,
  };
}

describe("workspaceGate", () => {
  it("waits for the catalog, and is free without one", () => {
    expect(workspaceGate(null, null)).toEqual({ kind: "loading" });
    expect(workspaceGate(catalog({ enabled: false }), null)).toEqual({
      kind: "free",
      catalogError: null,
    });
  });

  it("falls back to a free choice when the catalog cannot be read", () => {
    expect(workspaceGate(null, "boom")).toEqual({ kind: "free", catalogError: "boom" });
    expect(workspaceGate(catalog({ error: "list failed" }), null)).toEqual({
      kind: "free",
      catalogError: "list failed",
    });
  });

  it("blocks on the account the catalog needs", () => {
    const gate = workspaceGate(
      catalog({ requires: { id: "azure-devops", name: "Azure DevOps", connected: false } }),
      null
    );
    expect(gate).toEqual({
      kind: "connect",
      connection: { id: "azure-devops", name: "Azure DevOps" },
    });
  });

  it("offers only fully fetched projects that have a folder", () => {
    const gate = workspaceGate(
      catalog({
        items: [
          project(),
          project({ id: "half", cloned: false, partial: true, path: "/w/half" }),
          project({ id: "todo", cloned: false, path: null }),
          project({ id: "nofolder", path: null }),
        ],
      }),
      null
    );
    expect(gate).toEqual({
      kind: "projects",
      choices: [{ path: "/home/u/workspace/b2b-web", label: "b2b-web", projectId: "b2b-web" }],
    });
  });

  it("blocks when nothing is fetched yet, but not when the catalog gives no folders", () => {
    expect(workspaceGate(catalog({ items: [project({ cloned: false })] }), null)).toEqual({
      kind: "noProjects",
    });
    expect(workspaceGate(catalog({ items: [project({ path: null })] }), null)).toEqual({
      kind: "free",
      catalogError: null,
    });
  });
});

describe("free folder choices", () => {
  it("puts home first, drops the dashboard's own folder, and keeps the remembered pick", () => {
    const choices = freeChoices([
      { kind: "dashboard", path: "/srv/dashboard", label: "Dashboard server" },
      { kind: "recent", path: "/w/a", label: "a" },
      { kind: "home", path: "/home/u", label: "Home" },
    ]);
    expect(choices.map((c) => c.path)).toEqual(["/home/u", "/w/a"]);
    expect(pickWorkspace(choices, "/w/a")?.path).toBe("/w/a");
    expect(pickWorkspace(choices, "/gone")?.path).toBe("/home/u");
    expect(pickWorkspace([], null)).toBeNull();
  });
});

describe("connectionWarnings", () => {
  const list: ConnectionsResponse = {
    enabled: true,
    error: null,
    items: [
      connection({ id: "azure-devops", name: "Azure DevOps", required: true }),
      connection(),
      connection({ id: "ok", status: { connected: true, account: "me", detail: "" } }),
      connection({ id: "checking", status: null }),
    ],
  };

  it("warns about signed-out accounts except the blocking and dismissed ones", () => {
    expect(connectionWarnings(list, null, new Set()).map((c) => c.id)).toEqual([
      "azure-devops",
      "atlassian",
    ]);
    expect(connectionWarnings(list, "azure-devops", new Set()).map((c) => c.id)).toEqual([
      "atlassian",
    ]);
    expect(connectionWarnings(list, "azure-devops", new Set(["atlassian"]))).toEqual([]);
  });

  it("says nothing when connections are off or failed", () => {
    expect(connectionWarnings(null, null, new Set())).toEqual([]);
    expect(connectionWarnings({ ...list, enabled: false }, null, new Set())).toEqual([]);
    expect(connectionWarnings({ ...list, error: "bad file" }, null, new Set())).toEqual([]);
  });
});

describe("buildInbox", () => {
  it("puts waiting conversations first, then working, then finished runs", () => {
    const items = buildInbox(
      [
        handle({ id: "working", startedAt: 3_000 }),
        handle({ id: "waiting", turnState: "waiting", startedAt: 2_000 }),
        handle({ id: "headless", mode: "headless", turnState: "waiting", startedAt: 4_000 }),
        handle({ id: "done", status: "completed", endedAt: 5_000 }),
      ],
      [historyRow(), historyRow({ id: "done", prompt_preview: "dup" })]
    );
    expect(items.map((i) => [i.id, i.group])).toEqual([
      ["waiting", "needsYou"],
      ["headless", "working"],
      ["working", "working"],
      ["old-1", "finished"],
      ["done", "finished"],
    ]);
    expect(items.find((i) => i.id === "done")?.title).toBe("Review PR 1482");
  });

  it("lists a run history still marks live but the server lost as finished", () => {
    const items = buildInbox([], [historyRow({ status: "running", isLive: true, ended_at: null })]);
    expect(items[0]?.group).toBe("finished");
  });

  it("keeps only the newest finished runs", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      historyRow({ id: `r${i}`, ended_at: new Date(Date.UTC(2026, 10, 25, 10, i)).toISOString() })
    );
    const items = buildInbox([], rows, 3);
    expect(items.map((i) => i.id)).toEqual(["r11", "r10", "r9"]);
  });
});

describe("small helpers", () => {
  it("titles a run by its first non-empty prompt line", () => {
    expect(runTitle("\n  Fix the build  \nmore")).toBe("Fix the build");
    expect(runTitle(null)).toBe("");
    expect(runTitle("x".repeat(200))).toHaveLength(90);
  });

  it("finds ticket keys but not encodings or standards", () => {
    expect(ticketKeys("Làm PB2B-503 và PB2B-498, rồi PB2B-503 lần nữa; UTF-8, SHA-256")).toEqual([
      "PB2B-503",
      "PB2B-498",
    ]);
    expect(ticketKeys("A-1 B2-3 CD-4")).toEqual(["B2-3", "CD-4"]);
  });

  it("maps permission modes to trust levels", () => {
    expect(trustFromPermission("plan")).toBe("read");
    expect(trustFromPermission("acceptEdits")).toBe("edit");
    expect(trustFromPermission("bypassPermissions")).toBe("full");
    expect(trustFromPermission("default")).toBeNull();
  });
});

describe("chatItems", () => {
  it("folds consecutive tool calls into one group between messages", () => {
    const items = chatItems([
      { type: "system", subtype: "init" },
      { type: "user", message: { content: "Review PR 1482" } },
      {
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "hmm" },
            { type: "tool_use", name: "Read", input: { file_path: "a.ts" } },
          ],
        },
      },
      { type: "user", message: { content: [{ type: "tool_result", content: "..." }] } },
      {
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }] },
      },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Found a risk." }], _streaming: true },
      },
      { type: "result", subtype: "success" },
    ]);
    expect(items).toEqual([
      { kind: "user", text: "Review PR 1482" },
      {
        kind: "tools",
        calls: [
          { name: "Read", detail: "a.ts" },
          { name: "Bash", detail: "npm test" },
        ],
      },
      { kind: "assistant", text: "Found a risk.", streaming: true },
    ]);
  });

  it("tallies tools by how often they ran", () => {
    expect(
      toolTally([
        { name: "Read", detail: "" },
        { name: "Bash", detail: "" },
        { name: "Read", detail: "" },
      ])
    ).toEqual([
      { name: "Read", count: 2 },
      { name: "Bash", count: 1 },
    ]);
  });
});

describe("resuming an earlier session", () => {
  function session(over: Partial<Session> = {}): Session {
    return {
      id: "s-1",
      name: null,
      status: "completed",
      cwd: "/home/u/workspace/b2b-web/api",
      model: null,
      started_at: "2026-11-25T10:00:00.000Z",
      ended_at: null,
      metadata: null,
      provider: "claude",
      ...over,
    };
  }

  it("matches a folder and its subfolders only", () => {
    expect(insideFolder("/w/b2b-web", "/w/b2b-web")).toBe(true);
    expect(insideFolder("/w/b2b-web/api", "/w/b2b-web/")).toBe(true);
    expect(insideFolder("/w/b2b-web-old", "/w/b2b-web")).toBe(false);
  });

  it("offers Claude sessions inside the offered projects, and none while blocked", () => {
    const sessions = [
      session(),
      session({ id: "outside", cwd: "/tmp/scratch" }),
      session({ id: "codex", provider: "codex" }),
      session({ id: "nocwd", cwd: null }),
    ];
    const projects = workspaceGate(catalog(), null);
    expect(resumableSessions(sessions, projects).map((s) => s.id)).toEqual(["s-1"]);
    expect(
      resumableSessions(sessions, { kind: "free", catalogError: null }).map((s) => s.id)
    ).toEqual(["s-1", "outside"]);
    expect(resumableSessions(sessions, { kind: "noProjects" })).toEqual([]);
  });

  it("titles a session by its name, else its first prompt line", () => {
    expect(sessionTitle(session({ name: "Fix login" }))).toBe("Fix login");
    expect(sessionTitle(session({ prompt_preview: "Review PR\nmore" }))).toBe("Review PR");
    expect(sessionTitle(session())).toBe("");
  });
});
