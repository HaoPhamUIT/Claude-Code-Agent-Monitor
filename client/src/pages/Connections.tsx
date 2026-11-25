/**
 * @file Connections.tsx
 * @description Account connections page (`/connections`). Lists the sign-in
 * flows the operator defined in the file named by `DASHBOARD_CONNECTIONS_FILE`
 * and lets a person run them from the browser: it starts the sign-in command,
 * shows the link and device code the command printed, takes the redirect
 * address the person pastes back, and reports the outcome. The commands run on
 * the server; this page only names a connection and passes one pasted line.
 * State and polling live in `useConnections`, each card in `ConnectionCard`
 * (both shared with the onboarding gate); nothing here depends on the WebSocket.
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
 * page only names a connection and passes one pasted line. State and polling live in
 * `useConnections` , each card in `ConnectionCard` (both shared with the onboarding gate); nothing
 * here depends on the WebSocket.
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
 * - `../components/ConnectionCard` — repository-local contract consumed by this module; review its
 *   exports before changing assumptions here.
 * - `../components/EmptyState` — repository-local contract consumed by this module; review its
 *   exports before changing assumptions here.
 * - `../hooks/useConnections` — repository-local contract consumed by this module; review its
 *   exports before changing assumptions here.
 *
 * ## Package dependency edges
 * - `lucide-react` — external package boundary; keep usage within the installed version and the
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
 *
 * ## React and framework hooks
 * - `useConnections` — lifecycle/state dependency detected in this module; preserve dependency
 *   freshness and cleanup semantics.
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

import { useTranslation } from "react-i18next";
import { KeyRound, RefreshCw } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ConnectionCard } from "../components/ConnectionCard";
import { useConnections } from "../hooks/useConnections";

/**
 * Account connections page.
 * @returns The list of connections with their sign-in controls.
 */
export function Connections() {
  const { t } = useTranslation("connections");
  const { data, loadError, actionError, refreshing, load, connect, cancel, disconnect, sendInput } =
    useConnections();

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
        {data.items.map((item) => (
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
