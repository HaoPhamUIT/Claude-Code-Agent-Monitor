/**
 * @file useProjects.ts
 * @description Loads the project catalog (`GET /api/projects`) and keeps every
 * running fetch up to date: while a project's repositories are being fetched its
 * job is polled, and once a fetch ends the whole catalog is re-read so the
 * project shows as set up. Exposes `add` (fetch one or more projects) and
 * `cancel`. Used by the project picker in the first-run dialog and on the
 * Accounts page.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/hooks/useProjects.ts
 * **Area:** client hook
 * **Responsibility:**
 * Loads the project catalog (`GET /api/projects`) and keeps every running fetch up to date: while a
 * project's repositories are being fetched its job is polled, and once a fetch ends the whole
 * catalog is re-read so the project shows as set up. Exposes `add` (fetch one or more projects) and
 * `cancel` . Used by the project picker in the first-run dialog and on the Accounts page.
 *
 * ## Architectural boundary
 * - Owns a reusable React side-effect or stateful subscription while exposing a small declarative
 *   interface.
 * - The hook is responsible for setup, freshness, cleanup, and race handling; consumers should not
 *   duplicate that lifecycle.
 * - Shared transport and API semantics remain in library modules rather than being hidden inside
 *   component-specific closures.
 *
 * ## Local dependency edges
 * - `../lib/api` — repository-local contract consumed by this module; review its exports before
 *   changing assumptions here.
 *
 * ## Package dependency edges
 * - `react` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 * - `react-i18next` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 *
 * ## Public surface
 * - `ProjectsState` (interface) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 * - `useProjects` (function) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 *
 * ## Top-level implementation landmarks
 * - `messageOf` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `POLL_MS` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `ProjectsState` (interface) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `useProjects` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 *
 * ## React and framework hooks
 * - `useCallback` — lifecycle/state dependency detected in this module; preserve dependency
 *   freshness and cleanup semantics.
 * - `useEffect` — lifecycle/state dependency detected in this module; preserve dependency freshness
 *   and cleanup semantics.
 * - `useRef` — lifecycle/state dependency detected in this module; preserve dependency freshness
 *   and cleanup semantics.
 * - `useState` — lifecycle/state dependency detected in this module; preserve dependency freshness
 *   and cleanup semantics.
 * - `useTranslation` — lifecycle/state dependency detected in this module; preserve dependency
 *   freshness and cleanup semantics.
 *
 * ## Translation namespaces
 * - `connections` — visible copy resolves through this namespace; key and interpolation parity
 *   applies to every supported locale.
 *
 * ## Area invariants
 * - List every reactive dependency honestly or use stable refs intentionally with an explanatory
 *   comment.
 * - Clean up timers, sockets, observers, media objects, DOM listeners, and event-bus subscriptions
 *   on every exit path.
 * - Prevent stale async completions from updating state after unmount, reconnection, or parameter
 *   changes.
 * - Keep StrictMode mount-cleanup-remount behavior free of duplicate subscriptions and duplicate
 *   messages.
 * - Use functional state updates when the next value depends on the previous value across
 *   asynchronous callbacks.
 * - Keep callbacks stable only when consumers benefit; unnecessary memoization makes dependency
 *   contracts harder to audit.
 * - Surface recoverable status to consumers rather than swallowing failures into a permanently
 *   stale state.
 * - Do not expose mutable internal refs as if they were stable public state.
 * - Keep browser-only globals inside effect or capability checks so tests and non-browser tooling
 *   can load the module.
 * - Test mount, update, cleanup, failure, and retry behavior with the narrowest realistic
 *   dependency boundary.
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
 * - Run `npm run typecheck:client` and resolve failures before widening the verification scope.
 * - Run `npm run test:client` and resolve failures before widening the verification scope.
 * - Run `npm run verify` and resolve failures before widening the verification scope.
 *
 * ## Reference maintenance
 * - Regenerate all tracked references with `node scripts/maintain-typescript-docs.ts --write` .
 * - Check this module without writing via
 *   `node scripts/maintain-typescript-docs.ts --check client/src/hooks/useProjects.ts` .
 * - Prove existing-file edits are comments/trivia only with
 *   `node scripts/verify-typescript-comment-only.ts origin/master` .
 * - Review the regenerated diff: generated structure is evidence, not a substitute for
 *   understanding runtime behavior.
 *
 * GENERATED_MAINTAINER_REFERENCE:END
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { ProjectJob, ProjectsResponse } from "../lib/api";

/** How often a running fetch is polled. */
const POLL_MS = 1500;

/** Message of an unknown thrown value. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** What {@link useProjects} returns. */
export interface ProjectsState {
  /** The last catalog the server returned; null until the first load ends. */
  data: ProjectsResponse | null;
  /** Why the last load failed; null when it succeeded. */
  loadError: string | null;
  /** Translated message of the last failed action; null when the last one succeeded. */
  actionError: string | null;
  /** Re-read the catalog. */
  load: () => Promise<void>;
  /** Start fetching each project. Resolves true when every fetch started. */
  add: (ids: string[]) => Promise<boolean>;
  /** Cancel a running fetch. */
  cancel: (id: string) => Promise<boolean>;
}

/**
 * Load the project catalog and follow running fetches.
 * @param reloadKey Change it to re-read the catalog (for example once the
 *   connection a fetch needs has been signed in).
 * @returns The catalog plus the actions the picker offers.
 */
export function useProjects(reloadKey?: string): ProjectsState {
  const { t } = useTranslation("connections");
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await api.projects.list();
      if (!mounted.current) return;
      setData(next);
      setLoadError(null);
    } catch (err) {
      if (mounted.current) setLoadError(messageOf(err));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load, reloadKey]);

  /** Put a fresh job on its project. */
  const applyJob = useCallback((job: ProjectJob) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => (i.id === job.projectId ? { ...i, job } : i)),
          }
        : prev
    );
  }, []);

  // While fetches run, poll their jobs; once one ends, re-read the catalog.
  const runningIds = (data?.items ?? [])
    .filter((i) => i.job?.state === "running")
    .map((i) => i.id)
    .join(",");
  useEffect(() => {
    if (!runningIds) return;
    const ids = runningIds.split(",");
    const tick = window.setInterval(async () => {
      let finished = false;
      for (const id of ids) {
        try {
          const { job } = await api.projects.job(id);
          if (!mounted.current) return;
          applyJob(job);
          if (job.state !== "running") finished = true;
        } catch {
          finished = true;
        }
      }
      if (finished && mounted.current) void load();
    }, POLL_MS);
    return () => window.clearInterval(tick);
  }, [runningIds, applyJob, load]);

  return {
    data,
    loadError,
    actionError,
    load,
    add: async (ids) => {
      setActionError(null);
      let ok = true;
      // One at a time: the server caps concurrent fetches and reports each refusal.
      for (const id of ids) {
        try {
          applyJob((await api.projects.add(id)).job);
        } catch (err) {
          ok = false;
          if (mounted.current) {
            setActionError(t("projects.errors.addFailed", { message: messageOf(err) }));
          }
        }
      }
      return ok;
    },
    cancel: async (id) => {
      setActionError(null);
      try {
        applyJob((await api.projects.cancel(id)).job);
        return true;
      } catch (err) {
        if (mounted.current) {
          setActionError(t("projects.errors.cancelFailed", { message: messageOf(err) }));
        }
        return false;
      }
    },
  };
}
