/**
 * @file OnboardingGate.tsx
 * @description First-run gate for required account connections. When the
 * operator marks a connection `required` (for example Azure DevOps, without
 * which a workspace cannot fetch its project's code), the dashboard covers
 * every page with this dialog until that connection is signed in and its
 * sign-in job, which may still be cloning repositories, has finished without
 * failing. The
 * person can put it off for this browser session with "Later". Renders nothing
 * when connections are off, none is required, or the list cannot be loaded.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/components/OnboardingGate.tsx
 * **Area:** client component
 * **Responsibility:**
 * First-run gate for required account connections. When the operator marks a connection `required`
 * (for example Azure DevOps, without which a workspace cannot fetch its project's code), the
 * dashboard covers every page with this dialog until that connection is signed in and its sign-in
 * job, which may still be cloning repositories, has finished without failing. The person can put it
 * off for this browser session with "Later". Renders nothing when connections are off, none is
 * required, or the list cannot be loaded.
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
 * - `../hooks/useConnections` — repository-local contract consumed by this module; review its
 *   exports before changing assumptions here.
 * - `../lib/api` — repository-local contract consumed by this module; review its exports before
 *   changing assumptions here.
 * - `./ConnectionCard` — repository-local contract consumed by this module; review its exports
 *   before changing assumptions here.
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
 * - `needsAttention` (function) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 * - `ONBOARDING_LATER_KEY` (variable) — exported contract; search downstream imports and tests
 *   before changing its name, shape, or timing.
 * - `OnboardingGate` (function) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 *
 * ## Top-level implementation landmarks
 * - `laterChosen` (function) — top-level declaration that helps orient code review and focused test
 *   selection.
 * - `needsAttention` (function) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `ONBOARDING_LATER_KEY` (variable) — top-level declaration that helps orient code review and
 *   focused test selection.
 * - `OnboardingGate` (function) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `UNFINISHED` (variable) — top-level declaration that helps orient code review and focused test
 *   selection.
 *
 * ## React and framework hooks
 * - `useConnections` — lifecycle/state dependency detected in this module; preserve dependency
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
 *   `node scripts/maintain-typescript-docs.ts --check client/src/components/OnboardingGate.tsx` .
 * - Prove existing-file edits are comments/trivia only with
 *   `node scripts/verify-typescript-comment-only.ts origin/master` .
 * - Review the regenerated diff: generated structure is evidence, not a substitute for
 *   understanding runtime behavior.
 *
 * GENERATED_MAINTAINER_REFERENCE:END
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, KeyRound } from "lucide-react";
import { ConnectionCard } from "./ConnectionCard";
import { useConnections } from "../hooks/useConnections";
import type { ConnectionItem } from "../lib/api";

/** sessionStorage key that remembers "Later" until the browser tab closes. */
export const ONBOARDING_LATER_KEY = "ccam.onboarding.later";

/** Job states that leave a required connection unfinished (the person can retry). */
const UNFINISHED = new Set(["running", "failed", "timeout"]);

/**
 * True while a required connection still needs the person: not signed in, its
 * sign-in still running, or its last sign-in failed (for example the clone that
 * follows it).
 */
export function needsAttention(item: ConnectionItem): boolean {
  return (
    item.required &&
    (item.status?.connected !== true || (item.job !== null && UNFINISHED.has(item.job.state)))
  );
}

/** Whether "Later" was chosen in this browser session; storage errors count as no. */
function laterChosen(): boolean {
  try {
    return window.sessionStorage.getItem(ONBOARDING_LATER_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Full-screen dialog asking for the required connections.
 * @returns The dialog, or null when nothing is required right now.
 */
export function OnboardingGate() {
  const { t } = useTranslation("connections");
  const { data, actionError, connect, cancel, disconnect, sendInput } = useConnections();
  const [later, setLater] = useState(laterChosen);
  const [finished, setFinished] = useState(false);
  const wasPending = useRef(false);

  const required = data?.enabled && !data.error ? data.items.filter((i) => i.required) : [];
  const pending = required.some(needsAttention);

  // Shown once it was needed and everything is now done: say so before letting go.
  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) setFinished(true);
  }, [pending]);

  if (later || (!pending && !finished)) return null;

  const putOff = () => {
    try {
      window.sessionStorage.setItem(ONBOARDING_LATER_KEY, "1");
    } catch {
      /* storage blocked: "Later" still closes the dialog for this page load */
    }
    setLater(true);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center overflow-y-auto bg-surface-0/90 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-xl space-y-5 my-8">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            {finished ? (
              <CircleCheck className="w-5 h-5 text-emerald-400" aria-hidden />
            ) : (
              <KeyRound className="w-5 h-5 text-accent" aria-hidden />
            )}
          </div>
          <div className="space-y-1">
            <h1 id="onboarding-title" className="text-lg font-semibold text-gray-100">
              {finished ? t("onboarding.doneTitle") : t("onboarding.title")}
            </h1>
            <p className="text-sm text-gray-400">
              {finished ? t("onboarding.doneBody") : t("onboarding.body")}
            </p>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="card p-3 text-sm text-amber-400 border-amber-500/30">
            {actionError}
          </p>
        )}

        <div className="space-y-4">
          {required.map((item) => (
            <ConnectionCard
              key={item.id}
              item={item}
              onConnect={(id) => void connect(id)}
              onCancel={(id) => void cancel(id)}
              onDisconnect={(id) => void disconnect(id)}
              onInput={sendInput}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {finished ? (
            <button type="button" className="btn-primary" onClick={() => setLater(true)}>
              {t("onboarding.enter")}
            </button>
          ) : (
            <>
              <p className="text-xs text-gray-500">{t("onboarding.laterHint")}</p>
              <button type="button" className="btn-ghost" onClick={putOff}>
                {t("onboarding.later")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
