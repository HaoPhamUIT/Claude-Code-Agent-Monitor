/**
 * @file CommandCenter.test.tsx
 * @description Behaviour of the command centre (home page) against a mocked
 * API: Run is blocked and points to the Accounts page while the account the
 * project catalog needs is signed out; only fetched projects with a folder are
 * offered and a run starts in that folder with the chosen trust level; other
 * signed-out accounts get a warning that "Later" puts off; full access asks
 * first; and a waiting conversation opens with a reply box that sends to it.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "i18next";
import type {
  ConnectionItem,
  ConnectionsResponse,
  ProjectItem,
  ProjectsResponse,
  RunHandle,
} from "../../lib/api";

const runMocks = vi.hoisted(() => ({
  list: vi.fn(),
  history: vi.fn(),
  cwds: vi.fn(),
  models: vi.fn(),
  binary: vi.fn(),
  files: vi.fn(),
  start: vi.fn(),
  get: vi.fn(),
  send: vi.fn(),
  kill: vi.fn(),
}));
const connectionMocks = vi.hoisted(() => ({ list: vi.fn(), status: vi.fn(), job: vi.fn() }));
const projectMocks = vi.hoisted(() => ({ list: vi.fn(), job: vi.fn() }));
const sessionMocks = vi.hoisted(() => ({
  list: vi.fn(),
  transcript: vi.fn(() => Promise.resolve({ messages: [] })),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const empty = () => Promise.resolve({ items: [] });
  return {
    ...actual,
    api: {
      run: runMocks,
      connections: connectionMocks,
      projects: projectMocks,
      sessions: sessionMocks,
      stats: {
        get: vi.fn(() =>
          Promise.resolve({
            total_sessions: 3,
            active_sessions: 1,
            active_agents: 1,
            total_agents: 2,
            total_events: 10,
            events_today: 4,
            ws_connections: 1,
            agents_by_status: {},
            sessions_by_status: {},
          })
        ),
      },
      pricing: { totalCost: vi.fn(() => Promise.resolve({ total_cost: 1.5 })) },
      ccConfig: { commands: vi.fn(empty), skills: vi.fn(empty), workflows: vi.fn(empty) },
    },
  };
});

import { CommandCenter } from "../CommandCenter";

function connection(id: string, connected: boolean): ConnectionItem {
  return {
    id,
    name: id === "azure-devops" ? "Azure DevOps" : "Atlassian",
    description: "",
    canLogout: true,
    required: id === "azure-devops",
    status: { connected, account: connected ? "me" : "", detail: "" },
    job: null,
  };
}

function project(over: Partial<ProjectItem> = {}): ProjectItem {
  return {
    id: "b2b-web",
    name: "b2b-web",
    description: "",
    cloned: true,
    partial: false,
    path: "/home/me/workspace/b2b-web",
    job: null,
    ...over,
  };
}

function setAccounts(ado: boolean, atlassian: boolean) {
  const items = [connection("azure-devops", ado), connection("atlassian", atlassian)];
  const listing: ConnectionsResponse = { enabled: true, error: null, items };
  connectionMocks.list.mockResolvedValue(listing);
  connectionMocks.status.mockImplementation(async (id: string) => {
    const found = items.find((i) => i.id === id);
    return { id, required: found?.required ?? false, status: found?.status };
  });
  const catalog: ProjectsResponse = {
    enabled: true,
    error: null,
    requires: { id: "azure-devops", name: "Azure DevOps", connected: ado },
    items: [
      project(),
      project({ id: "half", name: "half", cloned: false, partial: true, path: null }),
    ],
  };
  projectMocks.list.mockResolvedValue(catalog);
}

function handle(over: Partial<RunHandle> = {}): RunHandle {
  return {
    id: "run-9",
    provider: "claude",
    pid: 9,
    mode: "conversation",
    cwd: "/home/me/workspace/b2b-web",
    model: null,
    permissionMode: "acceptEdits",
    effort: null,
    prompt: "Review PR 1482",
    argv: [],
    resumeSessionId: null,
    status: "running",
    startedAt: Date.now() - 60_000,
    endedAt: null,
    exitCode: null,
    signal: null,
    error: null,
    sessionId: "sess-9",
    envelopeCount: 0,
    stdoutTail: "",
    stderrTail: "",
    turnState: "working",
    lastActivity: null,
    progress: null,
    ...over,
  };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderPage() {
  render(
    <MemoryRouter>
      <CommandCenter />
    </MemoryRouter>
  );
  await settle();
  // Slash-command discovery is debounced by 300 ms.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 320));
  });
  await settle();
}

function runButton() {
  return screen.getByRole("button", { name: /^Run$/ });
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  runMocks.list.mockResolvedValue({ items: [], maxConcurrent: 10, activeCount: 0 });
  runMocks.history.mockResolvedValue({ items: [] });
  runMocks.cwds.mockResolvedValue({
    items: [{ kind: "home", path: "/home/me", label: "Home" }],
  });
  runMocks.models.mockResolvedValue({ provider: "claude", dynamic: false, source: "", items: [] });
  runMocks.binary.mockResolvedValue({ found: true, path: "/usr/bin/claude", provider: "claude" });
  runMocks.files.mockResolvedValue({ items: [] });
  connectionMocks.job.mockReturnValue(new Promise(() => {}));
  projectMocks.job.mockReturnValue(new Promise(() => {}));
});

describe("CommandCenter", () => {
  it("blocks Run and points to the Accounts page while Azure DevOps is signed out", async () => {
    setAccounts(false, true);
    await renderPage();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Azure DevOps is not connected.");
    expect(within(alert).getByRole("link", { name: /Connect Azure DevOps/ })).toHaveAttribute(
      "href",
      "/connections"
    );
    expect(
      screen.getByRole("link", { name: /Connect Azure DevOps to choose a project/ })
    ).toHaveAttribute("href", "/connections");
    fireEvent.change(screen.getByLabelText("What should the agent do?"), {
      target: { value: "Fix the build" },
    });
    expect(runButton()).toBeDisabled();
    expect(screen.getByText("Choose a project before running")).toBeInTheDocument();
  });

  it("offers only fetched projects and runs in the chosen project's folder", async () => {
    setAccounts(true, true);
    const started = handle({ id: "run-new", prompt: "Fix the build", turnState: "working" });
    runMocks.start.mockResolvedValue(started);
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Project/ }));
    expect(screen.getByText("Fetched projects")).toBeInTheDocument();
    expect(screen.queryByText("half")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fetch more projects/ })).toHaveAttribute(
      "href",
      "/connections"
    );
    fireEvent.click(screen.getByRole("button", { name: /b2b-web/, pressed: true }));

    fireEvent.click(screen.getByRole("button", { name: "Read only" }));
    fireEvent.change(screen.getByLabelText("What should the agent do?"), {
      target: { value: "Fix the build" },
    });
    await act(async () => {
      fireEvent.click(runButton());
    });
    await settle();
    expect(runMocks.start).toHaveBeenCalledWith({
      prompt: "Fix the build",
      mode: "conversation",
      provider: "claude",
      cwd: "/home/me/workspace/b2b-web",
      model: undefined,
      permissionMode: "plan",
    });
    expect(window.localStorage.getItem("pmca.command.workspace")).toBe(
      "/home/me/workspace/b2b-web"
    );
  });

  it("warns about Atlassian and puts the warning off with Later", async () => {
    setAccounts(true, false);
    await renderPage();
    const warning = screen.getByRole("status");
    expect(warning).toHaveTextContent("Atlassian is not connected.");
    fireEvent.click(within(warning).getByRole("button", { name: "Later" }));
    expect(screen.queryByText("Atlassian is not connected.")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("pmca.command.laterConnections")).toBe('["atlassian"]');
  });

  it("starts at full access and asks only when switching back to it", async () => {
    setAccounts(true, true);
    await renderPage();
    const pressed = (name: string) =>
      screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect(pressed("Full access")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Edit files" }));
    expect(screen.queryByText("Give the agent full access?")).not.toBeInTheDocument();
    expect(pressed("Edit files")).toBe("true");
    expect(window.localStorage.getItem("pmca.command.trust")).toBe("edit");

    fireEvent.click(screen.getByRole("button", { name: "Full access" }));
    expect(screen.getByText("Give the agent full access?")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Keep the current level" })[0]!);
    expect(pressed("Edit files")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Full access" }));
    fireEvent.click(screen.getByRole("button", { name: "Give full access" }));
    expect(pressed("Full access")).toBe("true");
    expect(window.localStorage.getItem("pmca.command.trust")).toBe("full");
  });

  it("opens a waiting conversation and sends the reply to it", async () => {
    setAccounts(true, true);
    const waiting = handle({ turnState: "waiting", lastActivity: "Read db/migrate.sql" });
    runMocks.list.mockResolvedValue({ items: [waiting], maxConcurrent: 10, activeCount: 1 });
    runMocks.get.mockResolvedValue({
      ...waiting,
      envelopes: [
        { type: "user", message: { content: "Review PR 1482" } },
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "Review the migration first?" }] },
        },
      ],
    });
    runMocks.send.mockResolvedValue({ messageId: "m-1" });
    await renderPage();

    expect(screen.getByText("Needs you · 1")).toBeInTheDocument();
    expect(screen.getByText("Review the migration first?")).toBeInTheDocument();
    const box = screen.getByPlaceholderText("Reply to the agent, or type / for a skill");
    fireEvent.change(box, { target: { value: "Yes, migration first" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(runMocks.send).toHaveBeenCalledWith("run-9", "Yes, migration first", "claude");
  });

  it("resumes an earlier session picked with #, in that session's folder", async () => {
    setAccounts(true, true);
    sessionMocks.list.mockResolvedValue({
      sessions: [
        {
          id: "old-1",
          name: "Fix login flow",
          status: "completed",
          cwd: "/home/me/workspace/b2b-web",
          model: null,
          started_at: "2026-11-25T10:00:00.000Z",
          ended_at: null,
          metadata: null,
          provider: "claude",
        },
        {
          id: "elsewhere",
          name: "Scratch work",
          status: "completed",
          cwd: "/tmp/scratch",
          model: null,
          started_at: "2026-11-25T09:00:00.000Z",
          ended_at: null,
          metadata: null,
          provider: "claude",
        },
      ],
      total: 2,
    });
    runMocks.start.mockResolvedValue(handle({ id: "run-resumed", prompt: "Add the tests" }));
    await renderPage();

    const box = screen.getByLabelText("What should the agent do?");
    fireEvent.change(box, { target: { value: "#" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    await settle();
    expect(screen.getByText("Earlier sessions to continue")).toBeInTheDocument();
    expect(screen.queryByText("Scratch work")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fix login flow/ }));

    expect(screen.getByText("Continuing")).toBeInTheDocument();
    expect(screen.getByText("Session folder")).toBeInTheDocument();
    expect(box).toHaveValue("");

    fireEvent.change(box, { target: { value: "Add the tests" } });
    await act(async () => {
      fireEvent.click(runButton());
    });
    await settle();
    expect(runMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Add the tests",
        cwd: "/home/me/workspace/b2b-web",
        resumeSessionId: "old-1",
        mode: "conversation",
        permissionMode: "bypassPermissions",
      })
    );
    expect(sessionMocks.transcript).toHaveBeenCalledWith("old-1", { limit: 200 });
    expect(screen.queryByText("Continuing")).not.toBeInTheDocument();
  });

  it("leaves #1482 as plain text", async () => {
    setAccounts(true, true);
    await renderPage();
    fireEvent.change(screen.getByLabelText("What should the agent do?"), {
      target: { value: "Review PR #1482" },
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(sessionMocks.list).not.toHaveBeenCalled();
    expect(screen.queryByText("Earlier sessions to continue")).not.toBeInTheDocument();
  });
});
