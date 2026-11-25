/**
 * @file ConnectionCard.tsx
 * @description One account connection as a card: its name, description and
 * sign-in status, the connect / reconnect / cancel / sign-out buttons, and the
 * guided steps of a running sign-in (open the link, enter the device code,
 * paste the redirect address). Once the operator's signed-in marker appears,
 * the steps give way to the command's latest line while it finishes (cloning
 * repositories, for example). Used by the Accounts page and the onboarding gate.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/components/ConnectionCard.tsx
 * **Area:** client component
 * **Responsibility:**
 * One account connection as a card: its name, description and sign-in status, the connect /
 * reconnect / cancel / sign-out buttons, and the guided steps of a running sign-in (open the link,
 * enter the device code, paste the redirect address). Once the operator's signed-in marker appears,
 * the steps give way to the command's latest line while it finishes (cloning repositories, for
 * example). Used by the Accounts page and the onboarding gate.
 *
 * ## Architectural boundary
 * - This component should express one reusable UI responsibility through typed props and observable
 *   callbacks.
 * - Network orchestration belongs in pages, hooks, or the typed API client unless this component
 *   explicitly owns the workflow.
 * - Visual state must remain a projection of props and local interaction state rather than a second
 *   server truth.
 *
 * ## Local dependency edges
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
 * - `ConnectionCard` (function) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 * - `ConnectionCardProps` (interface) — exported contract; search downstream imports and tests
 *   before changing its name, shape, or timing.
 *
 * ## Top-level implementation landmarks
 * - `ConnectionCard` (function) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `ConnectionCardProps` (interface) — top-level declaration that helps orient code review and
 *   focused test selection.
 * - `JobPanel` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `JobPanelProps` (interface) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `StatusBadge` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `StatusBadgeProps` (interface) — top-level declaration that helps orient code review and
 *   focused test selection.
 *
 * ## React and framework hooks
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
 * - Keep prop meaning and callback timing stable; parent components often rely on both even when
 *   types still compile.
 * - Render valid semantic controls with accessible names, focus behavior, disabled states, and
 *   keyboard operation.
 * - Keep visible strings in the appropriate i18n namespace rather than embedding English-only
 *   literals.
 * - Use shared design tokens and existing primitives so light/dark styling and compact layouts
 *   remain coherent.
 * - Avoid mutating arrays or objects received through props; derived display data should be
 *   computed immutably.
 * - Make empty and unavailable values explicit instead of rendering misleading zeroes or
 *   placeholder punctuation.
 * - Keep event handlers narrow and prevent accidental bubbling only when the enclosing interaction
 *   requires it.
 * - Do not duplicate server validation or destructive gates as if client-side checks were
 *   authoritative.
 * - Preserve responsive behavior at narrow widths and avoid fixed dimensions that clip translated
 *   copy.
 * - Prefer stable keys derived from entity identity over array indexes for live, filtered, or
 *   reordered collections.
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
 *   `node scripts/maintain-typescript-docs.ts --check client/src/components/ConnectionCard.tsx` .
 * - Prove existing-file edits are comments/trivia only with
 *   `node scripts/verify-typescript-comment-only.ts origin/master` .
 * - Review the regenerated diff: generated structure is evidence, not a substitute for
 *   understanding runtime behavior.
 *
 * GENERATED_MAINTAINER_REFERENCE:END
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, CircleCheck, CircleX, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import type { ConnectionItem, ConnectionJob } from "../lib/api";

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
        {item.job.signedIn ? t("status.finishing") : t("status.signingIn")}
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
  const signingIn = running && !job.signedIn;
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
      {signingIn && (
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

      {running && job.signedIn && (
        <div role="status" className="space-y-1.5 text-sm text-gray-300">
          <p className="flex items-center gap-2">
            <LoaderCircle className="w-4 h-4 animate-spin text-accent" aria-hidden />
            {t("steps.finishing")}
          </p>
          {job.progress && (
            <p className="pl-6 text-xs font-mono text-gray-500 break-all">{job.progress}</p>
          )}
        </div>
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

      {signingIn && otherUrls.length > 0 && (
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

/** Props for {@link ConnectionCard}. */
export interface ConnectionCardProps {
  /** The connection to show. */
  item: ConnectionItem;
  /** Start (or restart) its sign-in. */
  onConnect: (id: string) => void;
  /** Cancel its running sign-in. */
  onCancel: (id: string) => void;
  /** Run its sign-out command. */
  onDisconnect: (id: string) => void;
  /** Hand its running sign-in one pasted line; resolves true when it was accepted. */
  onInput: (id: string, text: string) => Promise<boolean>;
}

/**
 * One connection with its status, actions and running sign-in.
 * @returns A card section labelled with the connection's name.
 */
export function ConnectionCard({
  item,
  onConnect,
  onCancel,
  onDisconnect,
  onInput,
}: ConnectionCardProps) {
  const { t } = useTranslation("connections");
  const running = item.job?.state === "running";
  return (
    <section className="card p-4" aria-label={item.name}>
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
            <button type="button" className="btn-ghost" onClick={() => onCancel(item.id)}>
              {t("actions.cancel")}
            </button>
          ) : (
            <>
              {item.canLogout && item.status?.connected && (
                <button type="button" className="btn-ghost" onClick={() => onDisconnect(item.id)}>
                  {t("actions.disconnect")}
                </button>
              )}
              <button type="button" className="btn-primary" onClick={() => onConnect(item.id)}>
                {item.status?.connected ? t("actions.reconnect") : t("actions.connect")}
              </button>
            </>
          )}
        </div>
      </div>
      {item.job && <JobPanel job={item.job} onSubmit={(text) => onInput(item.id, text)} />}
    </section>
  );
}
