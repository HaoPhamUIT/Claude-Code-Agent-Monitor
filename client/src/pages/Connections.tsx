/**
 * @file Connections.tsx
 * @description Account connections page (`/connections`). Lists the sign-in
 * flows the operator defined in the file named by `DASHBOARD_CONNECTIONS_FILE`
 * and lets a person run them from the browser: it starts the sign-in command,
 * shows the link and device code the command printed, takes the redirect
 * address the person pastes back, and reports the outcome. The commands run on
 * the server; this page only names a connection and passes one pasted line.
 * While a sign-in is running the page polls that job; nothing here depends on
 * the WebSocket.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/pages/Connections.tsx
 * **Area:** client page
 * **Responsibility:**
 * Account connections page (`/connections`). Lists the sign-in flows the operator defined in the
 * file named by `DASHBOARD_CONNECTIONS_FILE` and lets a person run them from the browser: it starts
 * the sign-in command, shows the link and device code the command printed, takes the redirect
 * address the person pastes back, and reports the outcome. The commands run on the server; this
 * page only names a connection and passes one pasted line. While a sign-in is running the page
 * polls that job; nothing here depends on the WebSocket.
 *
 * ## Architectural boundary
 * - Route-level orchestration belongs here: load scoped data, subscribe to live updates, and
 *   compose reusable components.
 * - Server authority remains on the API side; the page may explain or confirm actions but must not
 *   invent authorization rules.
 * - The global data-source scope must flow through shared API helpers so local, all-source, and
 *   selected-source views agree.
 *
 * ## Local dependency edges
 * - `../components/EmptyState` — repository-local contract consumed by this module; review its
 *   exports before changing assumptions here.
 * - `../lib/api` — repository-local contract consumed by this module; review its exports before
 *   changing assumptions here.
 *
 * ## Package dependency edges
 * - `lucide-react` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 * - `react` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 * - `react-i18next` — external package boundary; keep usage within the installed version and the
 *   repository's existing adapter patterns.
 *
 * ## Public surface
 * - `Connections` (function) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 *
 * ## Top-level implementation landmarks
 * - `Connections` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `JobPanel` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `JobPanelProps` (interface) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `messageOf` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `POLL_MS` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `StatusBadge` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `StatusBadgeProps` (interface) — top-level declaration that helps orient code review and
 *   focused test selection.
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
 * - Represent loading, empty, partial, error, and refreshed states deliberately; a blank panel is
 *   not an error strategy.
 * - Cancel or ignore stale asynchronous work when parameters, source scope, or component lifetime
 *   changes.
 * - Merge WebSocket deltas without duplicating entities already returned by the REST snapshot.
 * - Keep query parameters and route state shareable when the surrounding router already exposes
 *   that state in URLs.
 * - Use translation keys for visible copy and preserve interpolation tokens across every supported
 *   locale.
 * - Keep expensive derivations memoized only when profiling or dependency stability justifies the
 *   extra contract.
 * - Preserve keyboard focus and useful headings when switching tabs, filters, drawers, or modal
 *   states.
 * - Do not make destructive requests without the confirmation and server-side gate required by the
 *   underlying API.
 * - Use canonical formatting helpers for timestamps, durations, token counts, costs, and provider
 *   labels.
 * - Keep page-level polling and event subscriptions bounded; cleanup must run on unmount and scope
 *   changes.
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
 *   `node scripts/maintain-typescript-docs.ts --check client/src/pages/Connections.tsx` .
 * - Prove existing-file edits are comments/trivia only with
 *   `node scripts/verify-typescript-comment-only.ts origin/master` .
 * - Review the regenerated diff: generated structure is evidence, not a substitute for
 *   understanding runtime behavior.
 *
 * GENERATED_MAINTAINER_REFERENCE:END
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { api } from "../lib/api";
import type { ConnectionItem, ConnectionJob, ConnectionsResponse } from "../lib/api";
import { EmptyState } from "../components/EmptyState";

/** How often a running sign-in is polled. */
const POLL_MS = 1500;

/** Message of an unknown thrown value. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Props for {@link StatusBadge}. */
interface StatusBadgeProps {
  /** The connection to describe. */
  item: ConnectionItem;
}

/** Pill that says whether a connection is signed in. */
function StatusBadge({ item }: StatusBadgeProps) {
  const { t } = useTranslation("connections");
  if (item.job?.state === "running") {
    return (
      <span className="badge bg-accent/15 text-accent border-accent/20">
        <LoaderCircle className="w-3 h-3 animate-spin" aria-hidden />
        {t("status.signingIn")}
      </span>
    );
  }
  if (item.status?.connected) {
    return (
      <span className="badge bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        <CircleCheck className="w-3 h-3" aria-hidden />
        {item.status.account
          ? t("status.connectedAs", { account: item.status.account })
          : t("status.connected")}
      </span>
    );
  }
  if (item.status?.connected === false) {
    return (
      <span className="badge bg-amber-500/10 text-amber-400 border-amber-500/20">
        <CircleAlert className="w-3 h-3" aria-hidden />
        {t("status.notConnected")}
      </span>
    );
  }
  return (
    <span className="badge bg-gray-500/10 text-gray-400 border-gray-500/20">
      {t("status.unknown")}
    </span>
  );
}

/** Props for {@link JobPanel}. */
interface JobPanelProps {
  /** The sign-in job to show. */
  job: ConnectionJob;
  /** Hands the pasted line to the running command; resolves true when it was accepted. */
  onSubmit: (text: string) => Promise<boolean>;
}

/** Guided steps and outcome of one sign-in job. */
function JobPanel({ job, onSubmit }: JobPanelProps) {
  const { t } = useTranslation("connections");
  const [pasted, setPasted] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const running = job.state === "running";
  const [signInUrl, ...otherUrls] = job.urls;

  /** Copy the device code; the button falls back to doing nothing without clipboard access. */
  const copyCode = async () => {
    if (!job.code) return;
    try {
      await navigator.clipboard.writeText(job.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the code stays selectable */
    }
  };

  /** Send the pasted address and clear the field once it was accepted. */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pasted.trim() || sending) return;
    setSending(true);
    try {
      if (await onSubmit(pasted)) setPasted("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 space-y-4">
      {running && (
        <ol className="space-y-4 text-sm text-gray-300">
          {signInUrl && (
            <li className="space-y-2">
              <p>{t("steps.open")}</p>
              <a href={signInUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
                <ExternalLink className="w-4 h-4" aria-hidden />
                {t("actions.openSignIn")}
              </a>
            </li>
          )}
          {job.code && (
            <li className="space-y-2">
              <p>{t("steps.code")}</p>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 rounded-lg bg-surface-4 border border-border text-lg font-mono tracking-widest text-gray-100 select-all">
                  {job.code}
                </code>
                <button type="button" className="btn-ghost" onClick={copyCode}>
                  <Copy className="w-4 h-4" aria-hidden />
                  {copied ? t("actions.copied") : t("actions.copy")}
                </button>
              </div>
            </li>
          )}
          {job.acceptsInput && (
            <li className="space-y-2">
              <form onSubmit={submit} className="space-y-2">
                <label htmlFor={`paste-${job.connectionId}`} className="block">
                  {job.inputLabel || t("steps.paste")}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id={`paste-${job.connectionId}`}
                    className="input flex-1 font-mono text-xs"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder={job.inputPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    className="btn-primary disabled:opacity-50"
                    disabled={!pasted.trim() || sending}
                  >
                    {t("actions.submit")}
                  </button>
                </div>
                <p className="text-xs text-gray-500">{t("steps.pasteHint")}</p>
              </form>
            </li>
          )}
          <li className="flex items-center gap-2 text-xs text-gray-500">
            <LoaderCircle className="w-3.5 h-3.5 animate-spin" aria-hidden />
            {signInUrl || job.code || job.acceptsInput ? t("steps.waiting") : t("steps.starting")}
          </li>
        </ol>
      )}

      {!running && (
        <p
          role="status"
          className={`flex items-center gap-2 text-sm ${
            job.state === "succeeded" ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {job.state === "succeeded" ? (
            <CircleCheck className="w-4 h-4" aria-hidden />
          ) : (
            <CircleX className="w-4 h-4" aria-hidden />
          )}
          {t(`result.${job.state}`)}
        </p>
      )}

      {running && otherUrls.length > 0 && (
        <div className="text-xs text-gray-500 space-y-1">
          <p>{t("steps.otherLinks")}</p>
          {otherUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-accent hover:underline"
            >
              {url}
            </a>
          ))}
        </div>
      )}

      {job.output.trim() && (
        <details open={job.state === "failed"}>
          <summary className="text-xs text-gray-500 cursor-pointer select-none">
            {t("actions.showOutput")}
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-surface-1 border border-border p-3 text-[11px] leading-relaxed text-gray-400 whitespace-pre-wrap break-all">
            {job.output.trim()}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Account connections page.
 * @returns The list of connections with their sign-in controls.
 */
export function Connections() {
  const { t } = useTranslation("connections");
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  /** Fetch every connection with its status. */
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await api.connections.list();
      if (!mounted.current) return;
      setData(next);
      setLoadError(null);
    } catch (err) {
      if (mounted.current) setLoadError(messageOf(err));
    } finally {
      if (mounted.current) setRefreshing(false);
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
   * Run one action on a connection, reporting a failure above the list.
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

  const connect = (id: string) =>
    act("errors.startFailed", async () => applyJob((await api.connections.login(id)).job));
  const cancel = (id: string) =>
    act("errors.cancelFailed", async () => applyJob((await api.connections.cancel(id)).job));
  const disconnect = (id: string) =>
    act("errors.disconnectFailed", async () => {
      await api.connections.logout(id);
      await load();
    });
  const sendInput = (id: string, text: string) =>
    act("errors.inputFailed", async () => applyJob((await api.connections.input(id, text)).job));

  const header = (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
          <KeyRound className="w-4 h-4 text-accent" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-100">{t("title")}</h1>
          <p className="text-xs text-gray-500">{t("subtitle")}</p>
        </div>
      </div>
      {data?.enabled && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void load()}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          {t("refresh")}
        </button>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (!data && loadError) {
    body = (
      <div className="card flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-sm text-gray-300">{t("loadFailed")}</p>
        <p className="text-xs text-gray-500">{loadError}</p>
        <button type="button" onClick={() => void load()} className="btn-primary text-sm">
          {t("retry")}
        </button>
      </div>
    );
  } else if (!data) {
    body = (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-surface-2" />
        ))}
      </div>
    );
  } else if (!data.enabled) {
    body = (
      <EmptyState icon={KeyRound} title={t("disabledTitle")} description={t("disabledBody")} />
    );
  } else if (data.error) {
    body = (
      <div className="card p-4 border-amber-500/30" role="alert">
        <p className="text-sm font-medium text-amber-400">{t("configErrorTitle")}</p>
        <p className="mt-1 text-xs text-gray-400 break-words">{data.error}</p>
      </div>
    );
  } else if (data.items.length === 0) {
    body = <EmptyState icon={KeyRound} title={t("emptyTitle")} description={t("disabledBody")} />;
  } else {
    body = (
      <div className="space-y-4">
        {data.items.map((item) => {
          const running = item.job?.state === "running";
          return (
            <section key={item.id} className="card p-4" aria-label={item.name}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-100">{item.name}</h2>
                    <StatusBadge item={item} />
                  </div>
                  {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                  {item.status?.connected === false && item.status.detail && (
                    <p className="text-xs text-gray-500">{item.status.detail}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {running ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void cancel(item.id)}
                    >
                      {t("actions.cancel")}
                    </button>
                  ) : (
                    <>
                      {item.canLogout && item.status?.connected && (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => void disconnect(item.id)}
                        >
                          {t("actions.disconnect")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void connect(item.id)}
                      >
                        {item.status?.connected ? t("actions.reconnect") : t("actions.connect")}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {item.job && (
                <JobPanel job={item.job} onSubmit={(text) => sendInput(item.id, text)} />
              )}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {header}
      {actionError && (
        <p role="alert" className="card p-3 text-sm text-amber-400 border-amber-500/30">
          {actionError}
        </p>
      )}
      {data && loadError && (
        <p role="alert" className="text-xs text-amber-400">
          {t("loadFailed")}: {loadError}
        </p>
      )}
      {body}
    </div>
  );
}
