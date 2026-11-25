/**
 * @file Connections.test.tsx
 * @description Behaviour of the account connections page against a mocked API:
 * the off state when no file is configured, the operator's file error, the
 * status of each connection, a device-code sign-in (link, code, polling until
 * it ends, then a status refresh), a paste-back sign-in (the pasted address is
 * sent, and kept in the field when the server refuses it), and sign-out.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/pages/__tests__/Connections.test.tsx
 * **Area:** client test
 * **Responsibility:**
 * Behaviour of the account connections page against a mocked API: the off state when no file is
 * configured, the operator's file error, the status of each connection, a device-code sign-in
 * (link, code, polling until it ends, then a status refresh), a paste-back sign-in (the pasted
 * address is sent, and kept in the field when the server refuses it), and sign-out.
 *
 * ## Architectural boundary
 * - Protects an observable client contract using Vitest and, for UI, Testing Library semantics.
 * - The test should fail for a meaningful production regression, not for harmless implementation
 *   rearrangement.
 * - Mocks isolate unavailable boundaries; they should not replace the behavior that the test claims
 *   to prove.
 *
 * ## Local dependency edges
 * - `../../lib/api` — repository-local contract consumed by this module; review its exports before
 *   changing assumptions here.
 * - `../Connections` — repository-local contract consumed by this module; review its exports before
 *   changing assumptions here.
 *
 * ## Package dependency edges
 * - `@testing-library/react` — external package boundary; keep usage within the installed version
 *   and the repository's existing adapter patterns.
 * - `i18next` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 * - `react-router` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 * - `vitest` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 *
 * ## Top-level implementation landmarks
 * - `item` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `job` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `listing` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `mocks` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `noCatalog` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `projectMocks` (variable) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `renderPage` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `settle` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 *
 * ## React and framework hooks
 * - `useFakeTimers` — lifecycle/state dependency detected in this module; preserve dependency
 *   freshness and cleanup semantics.
 * - `useRealTimers` — lifecycle/state dependency detected in this module; preserve dependency
 *   freshness and cleanup semantics.
 *
 * ## Named test contracts
 * - `Connections page` — executable behavior named by this suite; preserve the observable contract
 *   or update the test with rationale.
 * - `explains how to turn the page on when no file is configured` — executable behavior named by
 *   this suite; preserve the observable contract or update the test with rationale.
 * - `hides the project section when no catalog is configured` — executable behavior named by this
 *   suite; preserve the observable contract or update the test with rationale.
 * - `is translated` — executable behavior named by this suite; preserve the observable contract or
 *   update the test with rationale.
 * - `lists the project catalog below the accounts and fetches more projects` — executable behavior
 *   named by this suite; preserve the observable contract or update the test with rationale.
 * - `offers a retry and the full log when a fetch failed` — executable behavior named by this
 *   suite; preserve the observable contract or update the test with rationale.
 * - `offers a retry when the list cannot be loaded` — executable behavior named by this suite;
 *   preserve the observable contract or update the test with rationale.
 * - `runs a device-code sign-in: link and code, polling, then a status refresh` — executable
 *   behavior named by this suite; preserve the observable contract or update the test with
 *   rationale.
 * - `sends the pasted address, and keeps it in the field when the server refuses it` — executable
 *   behavior named by this suite; preserve the observable contract or update the test with
 *   rationale.
 * - `shows each connection's status and the matching actions` — executable behavior named by this
 *   suite; preserve the observable contract or update the test with rationale.
 * - `shows the command output when a sign-in fails` — executable behavior named by this suite;
 *   preserve the observable contract or update the test with rationale.
 * - `shows why the operator's file could not be loaded` — executable behavior named by this suite;
 *   preserve the observable contract or update the test with rationale.
 * - `signs out and re-reads the status` — executable behavior named by this suite; preserve the
 *   observable contract or update the test with rationale.
 *
 * ## Area invariants
 * - Name the user-visible or contract-level behavior in each test title so failures explain the
 *   regression.
 * - Query rendered UI by role, accessible name, or meaningful text before reaching for
 *   implementation selectors.
 * - Reset mocks, timers, globals, storage, and DOM state so execution order cannot change outcomes.
 * - Await asynchronous rendering and user interactions instead of relying on arbitrary sleeps.
 * - Keep fixtures minimal but structurally realistic, including provider and source fields used by
 *   production branches.
 * - Assert important negative behavior when duplicate events, stale responses, or absent data are
 *   the known risk.
 * - Avoid snapshots for volatile values unless serializers normalize them and review remains
 *   readable.
 * - Exercise keyboard and accessibility behavior for controls whose semantics matter beyond visual
 *   output.
 * - Do not assert internal hook state when the same contract can be observed through rendered
 *   output or callbacks.
 * - When fixing a regression, prove the test fails on the broken implementation before accepting
 *   the fix.
 *
 * ## Change-review checklist
 * - Read the file header and this generated index before changing code; both describe the intended
 *   ownership boundary.
 * - Trace every local import listed here to distinguish data contracts from presentation helpers
 *   and avoid circular dependencies.
 * - Search every exported symbol before changing its signature; callers may live in tests, route
 *   components, desktop code, or MCP wiring.
 * - Keep observable behavior stable unless the task explicitly requests a behavior change and
 *   includes regression coverage.
 * - Prefer the repository's existing helpers and types over parallel abstractions that encode the
 *   same contract twice.
 * - Keep failure behavior explicit: recoverable local failures should degrade visibly without
 *   hiding actionable diagnostics.
 * - Preserve deterministic ordering for lists, maps, serialized values, snapshots, and generated
 *   output where this module participates.
 * - Treat identifiers, API paths, event names, translation keys, and persisted field names as
 *   compatibility surfaces.
 * - Update the truthful file overview when the module's responsibility changes; never let the
 *   header become historical fiction.
 * - Run the narrowest relevant test first, then the area gate, then the full repository
 *   verification before merging.
 *
 * ## Focused validation
 * - Run `npm run test:client` and resolve failures before widening the verification scope.
 * - Run `npm run typecheck:client` and resolve failures before widening the verification scope.
 * - Run `npm run verify` and resolve failures before widening the verification scope.
 *
 * ## Reference maintenance
 * - Regenerate all tracked references with `node scripts/maintain-typescript-docs.ts --write` .
 * - Check this module without writing via
 *   `node scripts/maintain-typescript-docs.ts --check client/src/pages/__tests__/Connections.test.tsx`
 *   .
 * - Prove existing-file edits are comments/trivia only with
 *   `node scripts/verify-typescript-comment-only.ts origin/master` .
 * - Review the regenerated diff: generated structure is evidence, not a substitute for
 *   understanding runtime behavior.
 *
 * GENERATED_MAINTAINER_REFERENCE:END
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "i18next";
import type {
  ConnectionItem,
  ConnectionJob,
  ConnectionsResponse,
  ProjectsResponse,
} from "../../lib/api";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  status: vi.fn(),
  login: vi.fn(),
  job: vi.fn(),
  input: vi.fn(),
  cancel: vi.fn(),
  logout: vi.fn(),
}));

const projectMocks = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  job: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, api: { connections: mocks, projects: projectMocks } };
});

import { Connections } from "../Connections";

/** A job in the given state, with overrides. */
function job(connectionId: string, over: Partial<ConnectionJob> = {}): ConnectionJob {
  return {
    id: "job-1",
    connectionId,
    state: "running",
    startedAt: "2026-06-10T13:00:00.000Z",
    endedAt: null,
    exitCode: null,
    output: "",
    urls: [],
    code: null,
    acceptsInput: false,
    signedIn: false,
    progress: "",
    inputLabel: "",
    inputPlaceholder: "",
    ...over,
  };
}

/** A connection, with overrides. */
function item(id: string, over: Partial<ConnectionItem> = {}): ConnectionItem {
  return {
    id,
    name: id === "ado" ? "Azure DevOps" : "Atlassian",
    description: "",
    canLogout: id === "ado",
    required: false,
    status: { connected: false, account: "", detail: "" },
    job: null,
    ...over,
  };
}

const listing = (items: ConnectionItem[]): ConnectionsResponse => ({
  enabled: true,
  error: null,
  items,
});

/** Flush resolved promises and the effects they trigger. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderPage() {
  render(
    <MemoryRouter initialEntries={["/connections"]}>
      <Connections />
    </MemoryRouter>
  );
  await settle();
}

/**
 * Answer a status check the way the server would: from the connection as the
 * latest list response describes it (the hook lists with `?status=0`, then asks
 * for each status on its own).
 */
async function statusFromLatestList(id: string) {
  const results = mocks.list.mock.results;
  const latest = results[results.length - 1];
  const response = (await latest?.value) as ConnectionsResponse | undefined;
  const found = response?.items.find((i) => i.id === id);
  return {
    id,
    required: found?.required ?? false,
    status: found?.status ?? { connected: null, account: "", detail: "" },
  };
}

const noCatalog: ProjectsResponse = { enabled: false, error: null, requires: null, items: [] };

beforeEach(() => {
  i18n.changeLanguage("en");
  projectMocks.list.mockResolvedValue(noCatalog);
  mocks.status.mockImplementation(statusFromLatestList);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("Connections page", () => {
  it("explains how to turn the page on when no file is configured", async () => {
    mocks.list.mockResolvedValue({ enabled: false, error: null, items: [] });
    await renderPage();
    expect(screen.getByText("No connections are set up")).toBeTruthy();
    expect(screen.getByText(/DASHBOARD_CONNECTIONS_FILE/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("shows why the operator's file could not be loaded", async () => {
    mocks.list.mockResolvedValue({
      enabled: true,
      error: "could not load /etc/ccam/connections.json: file not found",
      items: [],
    });
    await renderPage();
    expect(screen.getByRole("alert").textContent).toContain("file not found");
  });

  it("offers a retry when the list cannot be loaded", async () => {
    mocks.list.mockRejectedValueOnce(new Error("HTTP 500"));
    await renderPage();
    expect(screen.getByText("HTTP 500")).toBeTruthy();
    mocks.list.mockResolvedValue(listing([item("ado")]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(screen.getByText("Azure DevOps")).toBeTruthy();
  });

  it("lists the connections at once and fills in each status when its own check answers", async () => {
    mocks.list.mockResolvedValue(
      listing([item("ado", { status: null }), item("atl", { status: null })])
    );
    let answerAtl: (value: unknown) => void = () => {};
    mocks.status.mockImplementation((id: string) =>
      id === "ado"
        ? Promise.resolve({
            id,
            required: false,
            status: { connected: true, account: "alice@example.com", detail: "" },
          })
        : new Promise((resolve) => {
            answerAtl = resolve;
          })
    );
    await renderPage();
    // The list itself runs no command; each status is asked for separately.
    expect(mocks.list).toHaveBeenCalledWith({ withStatus: false });
    expect(mocks.status.mock.calls.map(([id]) => id)).toEqual(["ado", "atl"]);
    // The slow check holds back only its own card.
    expect(screen.getByText("Connected as alice@example.com")).toBeTruthy();
    expect(screen.getByText("Checking…")).toBeTruthy();

    answerAtl({
      id: "atl",
      required: false,
      status: { connected: false, account: "", detail: "" },
    });
    await settle();
    expect(screen.queryByText("Checking…")).toBeNull();
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("shows each connection's status and the matching actions", async () => {
    mocks.list.mockResolvedValue(
      listing([
        item("ado", { status: { connected: true, account: "alice@example.com", detail: "" } }),
        item("atl", { status: { connected: false, account: "", detail: "not signed in" } }),
        item("x", {
          name: "No status command",
          status: { connected: null, account: "", detail: "" },
        }),
      ])
    );
    await renderPage();
    const ado = within(screen.getByRole("region", { name: "Azure DevOps" }));
    expect(ado.getByText("Connected as alice@example.com")).toBeTruthy();
    expect(ado.getByRole("button", { name: "Connect again" })).toBeTruthy();
    expect(ado.getByRole("button", { name: "Disconnect" })).toBeTruthy();

    const atl = within(screen.getByRole("region", { name: "Atlassian" }));
    expect(atl.getByText("Not connected")).toBeTruthy();
    expect(atl.getByText("not signed in")).toBeTruthy();
    expect(atl.getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(atl.queryByRole("button", { name: "Disconnect" })).toBeNull();

    const other = within(screen.getByRole("region", { name: "No status command" }));
    expect(other.getByText("Status unknown")).toBeTruthy();
  });

  it("runs a device-code sign-in: link and code, polling, then a status refresh", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    mocks.list.mockResolvedValue(listing([item("ado")]));
    mocks.login.mockResolvedValue({ job: job("ado") });
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await settle();
    expect(mocks.login).toHaveBeenCalledWith("ado");
    expect(screen.getByText("Signing in…")).toBeTruthy();
    expect(screen.getByText("Starting the sign-in…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    mocks.job.mockResolvedValue({
      job: job("ado", { urls: ["https://login.example.com/device"], code: "ABCD1234" }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await settle();
    const link = screen.getByRole("link", { name: "Open the sign-in page" });
    expect(link.getAttribute("href")).toBe("https://login.example.com/device");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("ABCD1234")).toBeTruthy();

    mocks.job.mockResolvedValue({
      job: job("ado", { state: "succeeded", exitCode: 0, endedAt: "2026-06-10T13:01:00.000Z" }),
    });
    mocks.list.mockResolvedValue(
      listing([
        item("ado", {
          status: { connected: true, account: "alice@example.com", detail: "" },
          job: job("ado", { state: "succeeded", exitCode: 0 }),
        }),
      ])
    );
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await settle();
    expect(screen.getByText("Signed in.")).toBeTruthy();
    expect(screen.getByText("Connected as alice@example.com")).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("sends the pasted address, and keeps it in the field when the server refuses it", async () => {
    const waiting = job("atl", {
      urls: ["https://auth.example.com/authorize?state=xyz"],
      acceptsInput: true,
      inputLabel: "Paste the address here",
      inputPlaceholder: "http://localhost:…",
    });
    mocks.list.mockResolvedValue(listing([item("atl", { job: waiting })]));
    await renderPage();

    const field = screen.getByLabelText("Paste the address here") as HTMLInputElement;
    expect(field.placeholder).toBe("http://localhost:…");
    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    mocks.input.mockRejectedValueOnce(new Error("text must be one line"));
    fireEvent.change(field, {
      target: { value: "http://localhost:5555/callback?code=1&state=xyz" },
    });
    fireEvent.click(submit);
    await settle();
    expect(mocks.input).toHaveBeenCalledWith(
      "atl",
      "http://localhost:5555/callback?code=1&state=xyz"
    );
    expect(screen.getByRole("alert").textContent).toContain("text must be one line");
    expect(field.value).toBe("http://localhost:5555/callback?code=1&state=xyz");

    mocks.input.mockResolvedValueOnce({ job: waiting });
    fireEvent.click(submit);
    await settle();
    expect(field.value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the command output when a sign-in fails", async () => {
    mocks.list.mockResolvedValue(
      listing([
        item("atl", {
          job: job("atl", { state: "failed", exitCode: 1, output: "OAuth state mismatch\n" }),
        }),
      ])
    );
    await renderPage();
    expect(screen.getByText("The sign-in did not complete.")).toBeTruthy();
    expect(screen.getByText("OAuth state mismatch")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
  });

  it("signs out and re-reads the status", async () => {
    mocks.list.mockResolvedValue(
      listing([item("ado", { status: { connected: true, account: "alice", detail: "" } })])
    );
    mocks.logout.mockResolvedValue({ ok: true, detail: "", status: null });
    await renderPage();
    mocks.list.mockResolvedValue(listing([item("ado")]));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await settle();
    expect(mocks.logout).toHaveBeenCalledWith("ado");
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("is translated", async () => {
    await i18n.changeLanguage("vi");
    mocks.list.mockResolvedValue(listing([item("ado")]));
    await renderPage();
    expect(screen.getByRole("heading", { name: "Kết nối tài khoản" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kết nối" })).toBeTruthy();
  });
  it("lists the project catalog below the accounts and fetches more projects", async () => {
    mocks.list.mockResolvedValue(
      listing([item("ado", { status: { connected: true, account: "alice", detail: "" } })])
    );
    projectMocks.list.mockResolvedValue({
      enabled: true,
      error: null,
      requires: { id: "ado", name: "Azure DevOps", connected: true },
      items: [
        { id: "ipa", name: "IPA", description: "", cloned: true, partial: false, job: null },
        { id: "demo", name: "Demo", description: "", cloned: false, partial: false, job: null },
      ],
    });
    projectMocks.add.mockResolvedValue({
      job: {
        id: "fetch-1",
        projectId: "demo",
        state: "running",
        startedAt: "2026-06-10T13:00:00.000Z",
        endedAt: null,
        exitCode: null,
        output: "",
        progress: "",
      },
    });
    projectMocks.job.mockReturnValue(new Promise(() => {}));
    await renderPage();
    const section = within(screen.getByRole("region", { name: "Projects" }));
    expect(section.getByText("1 of 2 projects set up")).toBeTruthy();
    // A project already in the workspace cannot be picked again.
    expect((section.getByLabelText("IPA") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(section.getByLabelText("Demo"));
    await act(async () => {
      fireEvent.click(section.getByRole("button", { name: "Fetch selected (1)" }));
    });
    expect(projectMocks.add).toHaveBeenCalledWith("demo");
    expect(section.getByText("Fetching…")).toBeTruthy();
  });

  it("offers a retry and the full log when a fetch failed", async () => {
    mocks.list.mockResolvedValue(listing([item("ado")]));
    projectMocks.list.mockResolvedValue({
      enabled: true,
      error: null,
      requires: null,
      items: [
        {
          id: "pos",
          name: "Enterprise POS",
          description: "",
          cloned: false,
          partial: true,
          job: {
            id: "fetch-2",
            projectId: "pos",
            state: "failed",
            startedAt: "2026-06-10T12:50:00.000Z",
            endedAt: "2026-06-10T12:51:00.000Z",
            exitCode: 1,
            output: "pmc-clone: cloning pos-backend\npmc-clone: FAILED pos-backend\n",
            progress: "pmc-clone: FAILED pos-backend",
          },
        },
      ],
    });
    projectMocks.add.mockResolvedValue({
      job: {
        id: "fetch-3",
        projectId: "pos",
        state: "running",
        startedAt: "2026-06-10T13:00:00.000Z",
        endedAt: null,
        exitCode: null,
        output: "",
        progress: "",
      },
    });
    projectMocks.job.mockReturnValue(new Promise(() => {}));
    await renderPage();
    const section = within(screen.getByRole("region", { name: "Projects" }));
    expect(section.getByText("Fetch failed")).toBeTruthy();
    expect(
      section.getByText("The fetch did not complete — pmc-clone: FAILED pos-backend")
    ).toBeTruthy();
    expect(section.getByText("Show the full log")).toBeTruthy();
    await act(async () => {
      fireEvent.click(section.getByRole("button", { name: "Try again" }));
    });
    expect(projectMocks.add).toHaveBeenCalledWith("pos");
  });

  it("hides the project section when no catalog is configured", async () => {
    mocks.list.mockResolvedValue(listing([item("ado")]));
    await renderPage();
    expect(screen.queryByRole("region", { name: "Projects" })).toBeNull();
  });
});
