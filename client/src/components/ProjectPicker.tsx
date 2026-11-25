/**
 * @file ProjectPicker.tsx
 * @description Lets a person pick projects from the operator's catalog and fetch
 * them into their workspace (the catalog's `add` command clones each project's
 * repositories). Shows every project with whether it is set up, a live tail of
 * the fetch output while one runs, and the outcome with the full log and a retry
 * when it fails. When the catalog needs an account connection first (`requires`),
 * picking is disabled until that connection is signed in. Used in the first-run
 * dialog (OnboardingGate) and on the Accounts page. Renders nothing when no
 * catalog is configured.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
/*
 * GENERATED_MAINTAINER_REFERENCE:BEGIN
 *
 * AUTO-GENERATED MAINTAINER REFERENCE — DO NOT EDIT THIS BLOCK BY HAND.
 * It is derived from the current TypeScript AST and repository-area contracts.
 * Regenerate after structural edits so imports, exports, landmarks, and checks stay current.
 *
 * **Module:** client/src/components/ProjectPicker.tsx
 * **Area:** client component
 * **Responsibility:**
 * Lets a person pick projects from the operator's catalog and fetch them into their workspace (the
 * catalog's `add` command clones each project's repositories). Shows every project with whether it
 * is set up, a live tail of the fetch output while one runs, and the outcome with the full log and
 * a retry when it fails. When the catalog needs an account connection first (`requires`), picking
 * is disabled until that connection is signed in. Used in the first-run dialog (OnboardingGate) and
 * on the Accounts page. Renders nothing when no catalog is configured.
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
 * - `../hooks/useProjects` — repository-local contract consumed by this module; review its exports
 *   before changing assumptions here.
 * - `../lib/api` — repository-local contract consumed by this module; review its exports before
 *   changing assumptions here.
 * - `../lib/outputTail` — repository-local contract consumed by this module; review its exports
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
 * - `ProjectPicker` (function) — exported contract; search downstream imports and tests before
 *   changing its name, shape, or timing.
 * - `ProjectPickerProps` (interface) — exported contract; search downstream imports and tests
 *   before changing its name, shape, or timing.
 *
 * ## Top-level implementation landmarks
 * - `ProjectPicker` (function) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `ProjectPickerProps` (interface) — top-level declaration that helps orient code review and
 *   focused test selection.
 * - `ProjectStatus` (function) — top-level declaration that helps orient code review and focused
 *   test selection.
 * - `ProjectStatusProps` (interface) — top-level declaration that helps orient code review and
 *   focused test selection.
 * - `UNSUCCESSFUL` (variable) — top-level declaration that helps orient code review and focused
 *   test selection.
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
 *   `node scripts/maintain-typescript-docs.ts --check client/src/components/ProjectPicker.tsx` .
 * - Prove existing-file edits are comments/trivia only with
 *   `node scripts/verify-typescript-comment-only.ts origin/master` .
 * - Review the regenerated diff: generated structure is evidence, not a substitute for
 *   understanding runtime behavior.
 *
 * GENERATED_MAINTAINER_REFERENCE:END
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  FolderGit2,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import type { ProjectItem } from "../lib/api";
import type { ProjectsState } from "../hooks/useProjects";
import { outputTail } from "../lib/outputTail";
import { cloneAccessProblem } from "../lib/cloneAccess";

/** Job states that end a fetch without the project being set up. */
const UNSUCCESSFUL = new Set(["failed", "cancelled", "timeout"]);

/** Props for {@link ProjectStatus}. */
interface ProjectStatusProps {
  /** The project to describe. */
  item: ProjectItem;
}

/** Pill that says whether a project is set up, being fetched, or failed. */
function ProjectStatus({ item }: ProjectStatusProps) {
  const { t } = useTranslation("connections");
  if (item.job?.state === "running") {
    return (
      <span className="badge bg-accent/15 text-accent border-accent/20">
        <LoaderCircle className="w-3 h-3 animate-spin" aria-hidden />
        {t("projects.status.fetching")}
      </span>
    );
  }
  if (item.cloned) {
    return (
      <span className="badge bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        <CircleCheck className="w-3 h-3" aria-hidden />
        {t("projects.status.cloned")}
      </span>
    );
  }
  if (item.job && UNSUCCESSFUL.has(item.job.state)) {
    return (
      <span className="badge bg-amber-500/10 text-amber-400 border-amber-500/20">
        <CircleX className="w-3 h-3" aria-hidden />
        {t("projects.status.failed")}
      </span>
    );
  }
  if (item.partial) {
    return (
      <span className="badge bg-amber-500/10 text-amber-400 border-amber-500/20">
        <CircleAlert className="w-3 h-3" aria-hidden />
        {t("projects.status.partial")}
      </span>
    );
  }
  return null;
}

/** Props for {@link ProjectPicker}. */
export interface ProjectPickerProps {
  /** The catalog and its actions, from `useProjects`. */
  state: ProjectsState;
  /** Show the section's own heading (off when the surrounding dialog has one). */
  showHeading?: boolean;
}

/**
 * Catalog of projects with selection, fetch progress and outcome.
 * @returns The picker section, or null when no catalog is configured.
 */
export function ProjectPicker({ state, showHeading = true }: ProjectPickerProps) {
  const { t } = useTranslation("connections");
  const { data, loadError, actionError, add, cancel, load } = state;
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const heading = showHeading ? (
    <div className="flex items-center gap-2">
      <FolderGit2 className="w-4 h-4 text-accent" aria-hidden />
      <h2 className="text-sm font-semibold text-gray-100">{t("projects.title")}</h2>
    </div>
  ) : null;

  if (!data) {
    if (!loadError) {
      return <div className="card h-20 animate-pulse bg-surface-2" aria-busy="true" />;
    }
    return (
      <section className="card p-4 space-y-2" aria-label={t("projects.title")}>
        {heading}
        <p className="text-sm text-amber-400">{t("projects.loadFailed")}</p>
        <p className="text-xs text-gray-500 break-words">{loadError}</p>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          {t("retry")}
        </button>
      </section>
    );
  }
  if (!data.enabled) return null;

  const blocked = data.requires !== null && !data.requires.connected;
  const selectable = (item: ProjectItem) => !item.cloned && item.job?.state !== "running";
  const picked = selected.filter((id) => data.items.some((i) => i.id === id && selectable(i)));
  const clonedCount = data.items.filter((i) => i.cloned).length;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** Fetch the picked projects, then clear the selection. */
  const fetchPicked = async () => {
    if (!picked.length || blocked || submitting) return;
    setSubmitting(true);
    try {
      await add(picked);
      setSelected([]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card p-4 space-y-4" aria-label={t("projects.title")}>
      <div className="space-y-1">
        {heading}
        <p className="text-xs text-gray-500">{t("projects.subtitle")}</p>
      </div>

      {data.error && (
        <div className="rounded-lg border border-amber-500/30 p-3" role="alert">
          <p className="text-sm font-medium text-amber-400">{t("projects.configError")}</p>
          <p className="mt-1 text-xs text-gray-400 break-words">{data.error}</p>
        </div>
      )}

      {blocked && data.requires && (
        <p className="flex items-center gap-2 text-xs text-amber-400" role="status">
          <CircleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {t("projects.requires", { name: data.requires.name })}
        </p>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-amber-400">
          {actionError}
        </p>
      )}

      {!data.error && data.items.length === 0 && (
        <p className="text-sm text-gray-400">{t("projects.empty")}</p>
      )}

      {data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((item) => {
            const job = item.job;
            const running = job?.state === "running";
            const unsuccessful = job !== null && UNSUCCESSFUL.has(job.state);
            const inputId = `project-${item.id}`;
            const tail = running && job ? outputTail(job.output) : [];
            const noAccess = unsuccessful && job ? cloneAccessProblem(job.output) : null;
            return (
              <li key={item.id} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-start gap-3">
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-0.5 accent-accent"
                    checked={item.cloned || running || picked.includes(item.id)}
                    disabled={!selectable(item) || blocked}
                    onChange={() => toggle(item.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={inputId} className="text-sm font-medium text-gray-100">
                        {item.name}
                      </label>
                      <ProjectStatus item={item} />
                    </div>
                    {item.description && (
                      <p className="text-xs text-gray-500">{item.description}</p>
                    )}
                    {running && (
                      <div
                        role="status"
                        aria-label={t("projects.progressLabel", { name: item.name })}
                      >
                        {tail.length > 0 ? (
                          <pre className="mt-1 max-h-28 overflow-auto rounded bg-surface-1 border border-border p-2 text-[11px] leading-relaxed text-gray-400 whitespace-pre-wrap break-all">
                            {tail.join("\n")}
                          </pre>
                        ) : (
                          <p className="text-xs text-gray-500">{t("projects.starting")}</p>
                        )}
                      </div>
                    )}
                    {noAccess && (
                      <div
                        role="alert"
                        className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5"
                      >
                        <LockKeyhole
                          className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-400"
                          aria-hidden
                        />
                        <div className="space-y-0.5 text-xs">
                          <p className="font-semibold text-amber-400">
                            {noAccess.repos.length > 0
                              ? t("projects.noAccess.titleRepos", {
                                  repos: noAccess.repos.join(", "),
                                })
                              : t("projects.noAccess.title")}
                          </p>
                          <p className="text-gray-300">{t("projects.noAccess.body")}</p>
                        </div>
                      </div>
                    )}
                    {unsuccessful && job && (
                      <div className="space-y-1">
                        <p className="text-xs text-amber-400" role="status">
                          {t(`projects.result.${job.state}`)}
                          {job.progress ? ` — ${job.progress}` : ""}
                        </p>
                        {job.output.trim() && (
                          <details className="text-xs text-gray-500">
                            <summary className="cursor-pointer hover:text-gray-300">
                              {t("projects.actions.showOutput")}
                            </summary>
                            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-surface-1 border border-border p-3 text-[11px] leading-relaxed text-gray-400 whitespace-pre-wrap break-all">
                              {job.output.trim()}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {running && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => void cancel(item.id)}
                      >
                        {t("projects.actions.cancel")}
                      </button>
                    )}
                    {unsuccessful && !item.cloned && (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={blocked}
                        onClick={() => void add([item.id])}
                      >
                        {t("projects.actions.retry")}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {t("projects.summary", { cloned: clonedCount, total: data.items.length })}
          </p>
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled={picked.length === 0 || blocked || submitting}
            onClick={() => void fetchPicked()}
          >
            {t("projects.addSelected", { count: picked.length })}
          </button>
        </div>
      )}
    </section>
  );
}
