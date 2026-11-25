/**
 * @file OnboardingGate.test.tsx
 * @description Tests for the first-run gate that asks for required account
 * connections: when it appears and when it stays away, the device-code steps,
 * the "finishing" state after sign-in (repositories still cloning), the done
 * state, and "Later" for the browser session.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/components/__tests__/OnboardingGate.test.tsx
 * **Area:** client test
 * **Responsibility:**
 * Tests for the first-run gate that asks for required account connections: when it appears and when
 * it stays away, the device-code steps, the "finishing" state after sign-in (repositories still
 * cloning), the done state, and "Later" for the browser session.
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
 * - `../OnboardingGate` — repository-local contract consumed by this module; review its exports
 *   before changing assumptions here.
 *
 * ## Package dependency edges
 * - `@testing-library/react` — external package boundary; keep usage within the installed version
 *   and the repository's existing adapter patterns.
 * - `i18next` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 * - `vitest` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 *
 * ## Top-level implementation landmarks
 * - `catalog` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
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
 * - `project` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `projectJob` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `projectMocks` (variable) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `renderGate` (function) — top-level declaration that helps orient code review and focused test
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
 * - `asks for projects once the required connection is in, and fetches the picked ones` —
 *   executable behavior named by this suite; preserve the observable contract or update the test
 *   with rationale.
 * - `asks only for the required connections, and starts the sign-in` — executable behavior named by
 *   this suite; preserve the observable contract or update the test with rationale.
 * - `can be put off for this browser session` — executable behavior named by this suite; preserve
 *   the observable contract or update the test with rationale.
 * - `keeps the project picker locked until the connection it needs is signed in` — executable
 *   behavior named by this suite; preserve the observable contract or update the test with
 *   rationale.
 * - `needsAttention: required and not signed in, still running, or failed` — executable behavior
 *   named by this suite; preserve the observable contract or update the test with rationale.
 * - `needsProjects: a configured catalog with nothing set up, or a fetch still running` —
 *   executable behavior named by this suite; preserve the observable contract or update the test
 *   with rationale.
 * - `OnboardingGate` — executable behavior named by this suite; preserve the observable contract or
 *   update the test with rationale.
 * - `says when everything is done, then lets the person in` — executable behavior named by this
 *   suite; preserve the observable contract or update the test with rationale.
 * - `shows the last lines of a running fetch` — executable behavior named by this suite; preserve
 *   the observable contract or update the test with rationale.
 * - `stays away once a project is set up and nothing is fetching` — executable behavior named by
 *   this suite; preserve the observable contract or update the test with rationale.
 * - `stays away when connections are off, none is required, or all are done` — executable behavior
 *   named by this suite; preserve the observable contract or update the test with rationale.
 * - `stays away when the list cannot be loaded` — executable behavior named by this suite; preserve
 *   the observable contract or update the test with rationale.
 * - `stays open while the signed-in job finishes, showing its latest output lines` — executable
 *   behavior named by this suite; preserve the observable contract or update the test with
 *   rationale.
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
 *   `node scripts/maintain-typescript-docs.ts --check client/src/components/__tests__/OnboardingGate.test.tsx`
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
import i18n from "i18next";
import type {
  ConnectionItem,
  ConnectionJob,
  ConnectionsResponse,
  ProjectItem,
  ProjectJob,
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

import {
  OnboardingGate,
  ONBOARDING_LATER_KEY,
  needsAttention,
  needsProjects,
} from "../OnboardingGate";

function job(over: Partial<ConnectionJob> = {}): ConnectionJob {
  return {
    id: "job-1",
    connectionId: "azure-devops",
    state: "running",
    startedAt: "2026-11-23T12:00:00.000Z",
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

function item(over: Partial<ConnectionItem> = {}): ConnectionItem {
  return {
    id: "azure-devops",
    name: "Azure DevOps",
    description: "Git and pull requests with your own account.",
    canLogout: true,
    required: true,
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

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderGate() {
  render(<OnboardingGate />);
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

function project(over: Partial<ProjectItem> = {}): ProjectItem {
  return {
    id: "ipa",
    name: "IPA",
    description: "Trading platform",
    cloned: false,
    partial: false,
    job: null,
    ...over,
  };
}

function projectJob(over: Partial<ProjectJob> = {}): ProjectJob {
  return {
    id: "fetch-1",
    projectId: "ipa",
    state: "running",
    startedAt: "2026-11-25T12:00:00.000Z",
    endedAt: null,
    exitCode: null,
    output: "",
    progress: "",
    ...over,
  };
}

const catalog = (
  items: ProjectItem[],
  requires: ProjectsResponse["requires"] = {
    id: "azure-devops",
    name: "Azure DevOps",
    connected: true,
  }
): ProjectsResponse => ({ enabled: true, error: null, requires, items });

beforeEach(() => {
  i18n.changeLanguage("en");
  window.sessionStorage.clear();
  projectMocks.list.mockResolvedValue(noCatalog);
  mocks.status.mockImplementation(statusFromLatestList);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("OnboardingGate", () => {
  it("stays away when connections are off, none is required, or all are done", async () => {
    for (const response of [
      { enabled: false, error: null, items: [] },
      listing([item({ required: false })]),
      listing([item({ status: { connected: true, account: "alice@pharmacity.vn", detail: "" } })]),
      { enabled: true, error: "could not load", items: [item()] },
    ]) {
      mocks.list.mockResolvedValueOnce(response);
      const { unmount } = render(<OnboardingGate />);
      await settle();
      expect(screen.queryByRole("dialog")).toBeNull();
      unmount();
    }
  });

  it("stays away when the list cannot be loaded", async () => {
    mocks.list.mockRejectedValue(new Error("HTTP 500"));
    await renderGate();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks only for the required connections, and starts the sign-in", async () => {
    mocks.list.mockResolvedValue(
      listing([item(), item({ id: "atlassian", name: "Atlassian", required: false })])
    );
    mocks.login.mockResolvedValue({
      job: job({ code: "ABCD1234", urls: ["https://microsoft.com/devicelogin"] }),
    });
    mocks.job.mockReturnValue(new Promise(() => {}));
    await renderGate();
    const dialog = within(
      screen.getByRole("dialog", { name: "One last step: connect your accounts" })
    );
    expect(dialog.getByRole("region", { name: "Azure DevOps" })).toBeTruthy();
    expect(dialog.queryByRole("region", { name: "Atlassian" })).toBeNull();

    fireEvent.click(dialog.getByRole("button", { name: "Connect" }));
    await settle();
    expect(mocks.login).toHaveBeenCalledWith("azure-devops");
    expect(dialog.getByText("ABCD1234")).toBeTruthy();
    expect(dialog.getByRole("link", { name: "Open the sign-in page" }).getAttribute("href")).toBe(
      "https://microsoft.com/devicelogin"
    );
  });

  it("stays open while the signed-in job finishes, showing its latest output lines", async () => {
    mocks.list.mockResolvedValue(
      listing([
        item({
          status: { connected: true, account: "alice@pharmacity.vn", detail: "" },
          job: job({
            code: "ABCD1234",
            urls: ["https://microsoft.com/devicelogin"],
            signedIn: true,
            output: [
              "1/3 Đăng nhập Azure DevOps",
              "2/3 MCP server azure-devops: đã cài",
              "3/3 Repo của dự án",
              "pmc-clone: cloning ipa-backend (develop)",
            ].join("\n"),
            progress: "pmc-clone: cloning ipa-backend (develop)",
          }),
        }),
      ])
    );
    mocks.job.mockReturnValue(new Promise(() => {}));
    await renderGate();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Signed in. Finishing setup…")).toBeTruthy();
    // The last few lines show what setup is doing now: the MCP step and the clone.
    const status = dialog.getByText("Signed in. Finishing setup…").closest('[role="status"]');
    expect(status?.textContent).toContain("2/3 MCP server azure-devops: đã cài");
    expect(status?.textContent).toContain("pmc-clone: cloning ipa-backend (develop)");
    expect(dialog.getByText("Finishing…")).toBeTruthy();
    // The sign-in steps are gone once signed in.
    expect(dialog.queryByText("ABCD1234")).toBeNull();
    expect(dialog.queryByRole("link", { name: "Open the sign-in page" })).toBeNull();
  });

  it("says when everything is done, then lets the person in", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = item({ job: job({ signedIn: true, progress: "cloning" }) });
    const done = item({
      status: { connected: true, account: "alice@pharmacity.vn", detail: "" },
      job: job({ state: "succeeded", signedIn: true, endedAt: "2026-11-23T12:03:00.000Z" }),
    });
    mocks.list.mockResolvedValueOnce(listing([running])).mockResolvedValue(listing([done]));
    mocks.job.mockResolvedValue({ job: done.job });
    await renderGate();
    expect(
      screen.getByRole("dialog", { name: "One last step: connect your accounts" })
    ).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    await settle();
    expect(screen.getByRole("dialog", { name: "You're all set" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the dashboard" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be put off for this browser session", async () => {
    mocks.list.mockResolvedValue(listing([item()]));
    await renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.sessionStorage.getItem(ONBOARDING_LATER_KEY)).toBe("1");

    const { unmount } = render(<OnboardingGate />);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
  });

  it("needsAttention: required and not signed in, still running, or failed", () => {
    expect(needsAttention(item())).toBe(true);
    expect(needsAttention(item({ required: false }))).toBe(false);
    // Still being checked: no dialog until the answer arrives, unless a sign-in runs.
    expect(needsAttention(item({ status: null }))).toBe(false);
    expect(needsAttention(item({ status: null, job: job() }))).toBe(true);
    const connected = { connected: true, account: "a", detail: "" };
    expect(needsAttention(item({ status: connected }))).toBe(false);
    expect(needsAttention(item({ status: connected, job: job() }))).toBe(true);
    expect(needsAttention(item({ status: connected, job: job({ state: "failed" }) }))).toBe(true);
    expect(needsAttention(item({ status: connected, job: job({ state: "succeeded" }) }))).toBe(
      false
    );
  });
  it("asks for projects once the required connection is in, and fetches the picked ones", async () => {
    mocks.list.mockResolvedValue(
      listing([item({ status: { connected: true, account: "alice@pharmacity.vn", detail: "" } })])
    );
    projectMocks.list.mockResolvedValue(
      catalog([project(), project({ id: "demo", name: "Demo", description: "" })])
    );
    projectMocks.add.mockResolvedValue({ job: projectJob() });
    projectMocks.job.mockReturnValue(new Promise(() => {}));
    await renderGate();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Choose your projects")).toBeTruthy();
    const fetch = dialog.getByRole("button", { name: "Fetch selected (0)" });
    expect((fetch as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dialog.getByLabelText("IPA"));
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Fetch selected (1)" }));
    });
    expect(projectMocks.add).toHaveBeenCalledWith("ipa");
    expect(projectMocks.add).toHaveBeenCalledTimes(1);
    expect(dialog.getByText("Fetching…")).toBeTruthy();
  });

  it("keeps the project picker locked until the connection it needs is signed in", async () => {
    mocks.list.mockResolvedValue(listing([item()]));
    projectMocks.list.mockResolvedValue(
      catalog([project()], { id: "azure-devops", name: "Azure DevOps", connected: false })
    );
    await renderGate();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("One last step: connect your accounts")).toBeTruthy();
    expect(
      dialog.getByText("Connect Azure DevOps first: fetching a project's code needs it.")
    ).toBeTruthy();
    expect((dialog.getByLabelText("IPA") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows the last lines of a running fetch", async () => {
    projectMocks.list.mockResolvedValue(
      catalog([
        project({
          job: projectJob({
            output: "pmc-clone: cloning ipa-backend (develop)\nReceiving objects:  42% (420/1000)",
            progress: "Receiving objects:  42% (420/1000)",
          }),
        }),
      ])
    );
    mocks.list.mockResolvedValue({ enabled: true, error: null, items: [] });
    projectMocks.job.mockReturnValue(new Promise(() => {}));
    await renderGate();
    const progress = screen.getByRole("status", { name: "Fetching IPA" });
    expect(progress.textContent).toContain("pmc-clone: cloning ipa-backend (develop)");
    expect(progress.textContent).toContain("Receiving objects:  42% (420/1000)");
  });

  it("stays away once a project is set up and nothing is fetching", async () => {
    mocks.list.mockResolvedValue({ enabled: true, error: null, items: [] });
    projectMocks.list.mockResolvedValue(
      catalog([project({ cloned: true }), project({ id: "demo" })])
    );
    await renderGate();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("needsProjects: a configured catalog with nothing set up, or a fetch still running", () => {
    expect(needsProjects(null)).toBe(false);
    expect(needsProjects(noCatalog)).toBe(false);
    expect(needsProjects(catalog([]))).toBe(false);
    expect(needsProjects({ ...catalog([project()]), error: "list failed" })).toBe(false);
    expect(needsProjects(catalog([project()]))).toBe(true);
    expect(needsProjects(catalog([project({ cloned: true })]))).toBe(false);
    expect(
      needsProjects(
        catalog([project({ cloned: true }), project({ id: "demo", job: projectJob() })])
      )
    ).toBe(true);
  });
});
