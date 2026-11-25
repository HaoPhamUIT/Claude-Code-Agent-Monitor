/**
 * @file useConnections.ts
 * @description State and actions for account connections, shared by the
 * Accounts page and the first-run onboarding gate: loads the connections, then
 * each one's status on its own (a slow one holds back only its card), polls a
 * running sign-in job until it ends (then re-reads every
 * status), and wraps connect / cancel / sign out / paste-back so a failure
 * becomes one translated message. Nothing here depends on the WebSocket.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/hooks/useConnections.ts
 * **Area:** client hook
 * **Responsibility:**
 * State and actions for account connections, shared by the Accounts page and the first-run
 * onboarding gate: loads the connections, then each one's status on its own (a slow one holds back
 * only its card), polls a running sign-in job until it ends (then re-reads every status), and wraps
 * connect / cancel / sign out / paste-back so a failure becomes one translated message. Nothing
 * here depends on the WebSocket.
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
 * - `ConnectionsState` (interface) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 * - `useConnections` (function) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 *
 * ## Top-level implementation landmarks
 * - `ConnectionsState` (interface) — top-level declaration that helps orient code review and
 *   focused test selection.
 * - `messageOf` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `POLL_MS` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `useConnections` (function) — top-level declaration that helps orient code review and focused
 *   test selection.
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
 *   `node scripts/maintain-typescript-docs.ts --check client/src/hooks/useConnections.ts` .
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
import type { ConnectionItem, ConnectionJob, ConnectionsResponse } from "../lib/api";

/** How often a running sign-in is polled. */
const POLL_MS = 1500;

/** Message of an unknown thrown value. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** What {@link useConnections} returns. */
export interface ConnectionsState {
  /** The last list the server returned; null until the first load ends. */
  data: ConnectionsResponse | null;
  /** Why the last load failed; null when it succeeded. */
  loadError: string | null;
  /** Translated message of the last failed action; null when the last one succeeded. */
  actionError: string | null;
  /** True while a load, or any of its status checks, is in flight. */
  refreshing: boolean;
  /** Re-read every connection with its status. */
  load: () => Promise<void>;
  /** Start a sign-in. Resolves true when it started. */
  connect: (id: string) => Promise<boolean>;
  /** Cancel a running sign-in. */
  cancel: (id: string) => Promise<boolean>;
  /** Run the sign-out command, then reload. */
  disconnect: (id: string) => Promise<boolean>;
  /** Hand the running sign-in one pasted line. */
  sendInput: (id: string, text: string) => Promise<boolean>;
}

/**
 * Load account connections and keep a running sign-in up to date.
 * @returns The current list plus the actions the page and the gate offer.
 */
export function useConnections(): ConnectionsState {
  const { t } = useTranslation("connections");
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  // Bumped by every load, so the answers of an older load cannot overwrite a newer one.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    const current = () => mounted.current && gen === generation.current;
    setRefreshing(true);
    try {
      // The list itself runs no command, so the cards show at once; each status
      // is then asked for on its own and fills in its card when it arrives.
      const list = await api.connections.list({ withStatus: false });
      if (!current()) return;
      setData((prev) => ({
        ...list,
        // Keep what the last check said while this one runs, so a reload does
        // not flash "checking" (or close the first-run dialog for a moment).
        items: list.items.map((item) => {
          const before = prev?.items.find((p) => p.id === item.id);
          return before?.status
            ? { ...item, required: before.required, status: before.status }
            : item;
        }),
      }));
      setLoadError(null);
      await Promise.all(
        list.items.map(async (item) => {
          let next: Pick<ConnectionItem, "required" | "status">;
          try {
            const r = await api.connections.status(item.id);
            next = { required: r.required, status: r.status };
          } catch (err) {
            next = {
              required: item.required,
              status: { connected: null, account: "", detail: messageOf(err) },
            };
          }
          if (!current()) return;
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map((i) => (i.id === item.id ? { ...i, ...next } : i)),
                }
              : prev
          );
        })
      );
    } catch (err) {
      if (current()) setLoadError(messageOf(err));
    } finally {
      if (current()) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  /** Put a fresh job on its connection. */
  const applyJob = useCallback((job: ConnectionJob) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => (i.id === job.connectionId ? { ...i, job } : i)),
          }
        : prev
    );
  }, []);

  // While a sign-in runs, poll its job; once it ends, re-read every status.
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
          const { job } = await api.connections.job(id);
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

  /**
   * Run one action on a connection, reporting a failure as `actionError`.
   * @returns True when the action succeeded.
   */
  const act = async (errorKey: string, run: () => Promise<void>): Promise<boolean> => {
    setActionError(null);
    try {
      await run();
      return true;
    } catch (err) {
      if (mounted.current) setActionError(t(errorKey, { message: messageOf(err) }));
      return false;
    }
  };

  return {
    data,
    loadError,
    actionError,
    refreshing,
    load,
    connect: (id) =>
      act("errors.startFailed", async () => applyJob((await api.connections.login(id)).job)),
    cancel: (id) =>
      act("errors.cancelFailed", async () => applyJob((await api.connections.cancel(id)).job)),
    disconnect: (id) =>
      act("errors.disconnectFailed", async () => {
        await api.connections.logout(id);
        await load();
      }),
    sendInput: (id, text) =>
      act("errors.inputFailed", async () => applyJob((await api.connections.input(id, text)).job)),
  };
}
