/**
 * @file Composer.tsx
 * @description The command centre's task box: a large prompt editor with `/`
 * skill and `@` file completion, recognised Jira ticket keys, the project (or
 * folder) the agent runs in, a three-step trust dial, the model, and Run. When
 * the project catalog needs an account that is not signed in, or nothing has
 * been fetched yet, it says so and sends the person to the Accounts page
 * instead of offering a folder; other signed-out accounts get a dismissible
 * warning. All state lives in the page; this component only draws it.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  FolderGit2,
  PencilLine,
  History,
  Plus,
  Ticket,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ConnectionItem, ModelChoice } from "../../lib/api";
import {
  TRUST_LEVELS,
  ticketKeys,
  type ResumeTarget,
  type TrustLevel,
  type WorkspaceChoice,
  type WorkspaceGate,
} from "../../lib/commandCenter";
import { PromptEditor, type HashCompletion, type SlashCommand } from "../../pages/Run";
import { Select } from "../Select";

/** Id of the prompt textarea, so the page heading can label it and chips can focus it. */
export const COMPOSER_INPUT_ID = "command-composer-input";

const TRUST_ICONS: Record<TrustLevel, LucideIcon> = { read: Eye, edit: PencilLine, full: Zap };

export interface ComposerProps {
  prompt: string;
  onPromptChange: (text: string) => void;
  gate: WorkspaceGate;
  /** Folders on offer (catalog projects, or free choices). */
  choices: WorkspaceChoice[];
  workspace: WorkspaceChoice | null;
  onWorkspaceChange: (choice: WorkspaceChoice) => void;
  trust: TrustLevel;
  /** Called with the level picked on the dial; the page confirms `full` first. */
  onTrustChange: (level: TrustLevel) => void;
  model: string;
  models: ModelChoice[];
  onModelChange: (model: string) => void;
  slashCommands: SlashCommand[];
  /** Signed-out accounts to warn about (never the one the gate blocks on). */
  warnings: ConnectionItem[];
  onDismissWarning: (id: string) => void;
  binaryMissing: boolean;
  starting: boolean;
  onRun: () => void;
  resume: ResumeTarget | null;
  onClearResume: () => void;
  hashCompletion?: HashCompletion;
}

/**
 * A folder path short enough for a picker line: its last three segments behind `…/` when it has
 * more (the full path stays in the tooltip).
 */
function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : path;
}

/** Whether the gate lets a run start at all. */
function gateAllowsRun(gate: WorkspaceGate): boolean {
  return gate.kind === "free" || gate.kind === "projects";
}

export function Composer(props: ComposerProps) {
  const { t } = useTranslation("command");
  const tickets = ticketKeys(props.prompt);
  const blocked = !gateAllowsRun(props.gate);
  const resume = props.resume;
  const canRun =
    !props.starting &&
    !props.binaryMissing &&
    props.prompt.trim().length > 0 &&
    (resume !== null || (!blocked && props.workspace !== null));
  const fileCwd = resume?.cwd ?? props.workspace?.path ?? "";
  const modelOptions = [
    { value: "", label: t("model.default") },
    ...props.models.map((m) => ({ value: m.id, label: m.label, hint: m.hint })),
  ];

  return (
    <div
      className={`rounded-2xl border-2 bg-surface-1 shadow-md overflow-visible ${
        blocked ? "border-amber-500/70" : "border-accent"
      }`}
    >
      {props.gate.kind === "connect" && (
        <GateNotice
          title={t("connections.gateTitle", { name: props.gate.connection.name })}
          body={t("connections.gateBody", { name: props.gate.connection.name })}
          action={t("connections.gateAction", { name: props.gate.connection.name })}
        />
      )}
      {props.gate.kind === "noProjects" && (
        <GateNotice
          title={t("connections.noProjectsTitle")}
          body={t("connections.noProjectsBody")}
          action={t("connections.noProjectsAction")}
        />
      )}
      {props.warnings.map((item) => (
        <div
          key={item.id}
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 first:rounded-t-2xl"
        >
          <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden />
          <p className="flex-1 min-w-[16rem] text-[13px] text-gray-200">
            <strong className="font-semibold text-amber-400">
              {t("connections.warnTitle", { name: item.name })}
            </strong>{" "}
            {item.description ? `${item.description} ` : ""}
            {t("connections.warnBody")}
          </p>
          <Link
            to="/connections"
            className="inline-flex items-center min-h-[36px] rounded-lg border border-border-light bg-surface-1 px-3 text-[13px] font-semibold text-gray-100 hover:bg-surface-4"
          >
            {t("connections.warnAction", { name: item.name })}
          </Link>
          <button
            type="button"
            onClick={() => props.onDismissWarning(item.id)}
            className="min-h-[36px] rounded-lg px-2.5 text-[13px] font-medium text-gray-400 hover:text-gray-200 hover:bg-surface-4"
          >
            {t("connections.later")}
          </button>
        </div>
      ))}

      <div className="p-4 space-y-3">
        {(resume || tickets.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {resume && (
              <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 py-1 pl-2.5 pr-1 text-xs">
                <History className="w-3.5 h-3.5 shrink-0 text-violet-400" aria-hidden />
                <span className="shrink-0 font-semibold text-violet-400">{t("resume.chip")}</span>
                <span className="truncate font-semibold text-gray-100">
                  {resume.title || t("inbox.untitled")}
                </span>
                <span title={resume.cwd} className="shrink-0 font-mono text-gray-400">
                  {shortPath(resume.cwd)}
                </span>
                <button
                  type="button"
                  aria-label={t("resume.clear")}
                  title={t("resume.clear")}
                  onClick={props.onClearResume}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-surface-4 hover:text-gray-200"
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </span>
            )}
            {tickets.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs"
              >
                <Ticket className="w-3.5 h-3.5 text-accent" aria-hidden />
                <span className="font-mono font-bold text-accent">{key}</span>
                <span className="text-gray-400">{t("composer.ticket")}</span>
              </span>
            ))}
          </div>
        )}

        <PromptEditor
          id={COMPOSER_INPUT_ID}
          value={props.prompt}
          onChange={props.onPromptChange}
          onSubmit={() => {
            if (canRun) props.onRun();
          }}
          submitOnEnter
          rows={3}
          placeholder={resume ? t("resume.placeholder") : t("composer.placeholder")}
          slashCommands={props.slashCommands}
          fileCwd={fileCwd}
          hashCompletion={resume ? undefined : props.hashCompletion}
          textareaClassName="w-full resize-none bg-transparent px-1 py-1 text-base leading-relaxed text-gray-100 placeholder:text-gray-500 focus:outline-none font-sans"
        />

        <div className="flex flex-wrap items-center gap-2">
          {resume ? (
            <span
              title={resume.cwd}
              className="inline-flex max-w-[26rem] items-center gap-2 h-11 rounded-lg border border-border bg-surface-2 px-3 text-[13px] text-gray-400"
            >
              <FolderGit2 className="w-4 h-4 shrink-0" aria-hidden />
              <span className="shrink-0">{t("resume.folder")}</span>
              <span className="min-w-0 truncate font-mono text-[11.5px] text-gray-200">
                {shortPath(resume.cwd)}
              </span>
            </span>
          ) : (
            <WorkspacePicker
              gate={props.gate}
              choices={props.choices}
              workspace={props.workspace}
              onChange={props.onWorkspaceChange}
            />
          )}
          <TrustDial value={props.trust} onChange={props.onTrustChange} />
          <div className="w-36">
            <Select<string>
              value={props.model}
              onChange={props.onModelChange}
              options={modelOptions}
            />
          </div>
          {/* Shrinks (and truncates) before the Run button is pushed onto its own line. */}
          <span className="min-w-0 flex-1 truncate text-right text-xs text-gray-500">
            {blocked && !resume ? t("composer.chooseProjectFirst") : ""}
          </span>
          <button
            type="button"
            onClick={props.onRun}
            disabled={!canRun}
            className="inline-flex items-center gap-2 h-11 rounded-lg bg-accent px-5 text-sm font-bold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-5 disabled:text-gray-500"
          >
            {props.starting ? t("composer.starting") : t("composer.run")}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {props.binaryMissing && (
          <p role="alert" className="text-xs text-red-400">
            {t("composer.binaryMissing")}
          </p>
        )}
        {props.gate.kind === "free" && props.gate.catalogError && (
          <p className="text-xs text-amber-400">
            {t("workspace.catalogError", { error: props.gate.catalogError })}
          </p>
        )}
      </div>
    </div>
  );
}

/** A blocking notice at the top of the composer with a link to the Accounts page. */
function GateNotice({ title, body, action }: { title: string; body: string; action: string }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-2xl border-b border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <TriangleAlert className="w-5 h-5 text-amber-400 shrink-0" aria-hidden />
      <p className="flex-1 min-w-[16rem] text-[13px] text-gray-200">
        <strong className="font-semibold text-amber-400">{title}</strong> {body}
      </p>
      <Link
        to="/connections"
        className="inline-flex items-center gap-2 h-11 rounded-lg bg-accent px-4 text-[13px] font-bold text-white hover:bg-accent-hover"
      >
        {action}
        <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/** Three-step trust dial: read only, edit files, full access. */
function TrustDial({
  value,
  onChange,
}: {
  value: TrustLevel;
  onChange: (level: TrustLevel) => void;
}) {
  const { t } = useTranslation("command");
  return (
    <div
      role="group"
      aria-label={t("trust.label")}
      className="inline-flex h-11 overflow-hidden rounded-lg border border-border bg-surface-1"
    >
      {TRUST_LEVELS.map((level, i) => {
        const Icon = TRUST_ICONS[level];
        const active = level === value;
        return (
          <button
            key={level}
            type="button"
            aria-pressed={active}
            title={t(`trust.${level}Hint`)}
            onClick={() => onChange(level)}
            className={`inline-flex items-center gap-1.5 px-3 text-[13px] transition-colors ${
              i > 0 ? "border-l border-border" : ""
            } ${
              active
                ? level === "full"
                  ? "bg-amber-500/15 font-bold text-amber-400"
                  : "bg-accent/10 font-bold text-accent"
                : "font-medium text-gray-400 hover:bg-surface-4 hover:text-gray-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden />
            {t(`trust.${level}`)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The project (or folder) picker. With a catalog it lists only fetched projects, each with its
 * folder, plus a link to fetch more; without one it lists known folders and takes any path.
 * When the gate blocks, it becomes a link to the Accounts page.
 */
function WorkspacePicker({
  gate,
  choices,
  workspace,
  onChange,
}: {
  gate: WorkspaceGate;
  choices: WorkspaceChoice[];
  workspace: WorkspaceChoice | null;
  onChange: (choice: WorkspaceChoice) => void;
}) {
  const { t } = useTranslation("command");
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (gate.kind === "connect" || gate.kind === "noProjects") {
    const label =
      gate.kind === "connect"
        ? t("workspace.connectToChoose", { name: gate.connection.name })
        : t("workspace.fetchToChoose");
    return (
      <Link
        to="/connections"
        className="inline-flex items-center gap-2 h-11 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 text-[13px] font-bold text-amber-400 hover:bg-amber-500/15"
      >
        <FolderGit2 className="w-4 h-4" aria-hidden />
        {label}
        <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </Link>
    );
  }

  const isProjects = gate.kind === "projects";
  const pick = (choice: WorkspaceChoice) => {
    onChange(choice);
    setOpen(false);
  };
  const applyCustom = () => {
    const path = custom.trim();
    if (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path)) return;
    const label = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
    pick({ path, label });
    setCustom("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={gate.kind === "loading"}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex max-w-[26rem] items-center gap-2 h-11 rounded-lg border bg-surface-1 px-3 text-[13px] text-gray-400 hover:bg-surface-4 disabled:opacity-60 ${
          open ? "border-accent" : "border-border"
        }`}
      >
        <FolderGit2 className="w-4 h-4 shrink-0" aria-hidden />
        <span>{t("workspace.label")}</span>
        {gate.kind === "loading" ? (
          <span className="text-gray-500">{t("workspace.loading")}</span>
        ) : workspace ? (
          <>
            <span className="shrink-0 font-bold text-gray-100">{workspace.label}</span>
            <span
              title={workspace.path}
              className="hidden min-w-0 truncate font-mono text-[11.5px] text-gray-500 sm:inline"
            >
              {shortPath(workspace.path)}
            </span>
          </>
        ) : (
          <span className="text-gray-500">{t("workspace.none")}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute left-0 top-full z-40 mt-2 w-[min(28rem,85vw)] rounded-xl border border-border bg-surface-1 p-2 shadow-lg"
        >
          <p className="px-2.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {isProjects ? t("workspace.projectsTitle") : t("workspace.freeTitle")}
          </p>
          <p className="px-2.5 pb-2 text-xs text-gray-400">
            {isProjects ? t("workspace.projectsHint") : t("workspace.freeHint")}
          </p>
          <div className="max-h-72 overflow-y-auto">
            {choices.map((choice) => {
              const active = choice.path === workspace?.path;
              return (
                <button
                  key={choice.path}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pick(choice)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                    active ? "bg-accent/10" : "hover:bg-surface-4"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <FolderGit2 className="w-4 h-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-bold text-gray-100">
                      {choice.label}
                    </span>
                    <span
                      title={choice.path}
                      className="truncate font-mono text-[11.5px] text-gray-400"
                    >
                      {shortPath(choice.path)}
                    </span>
                  </span>
                  {active && <Check className="w-4 h-4 text-accent" aria-hidden />}
                </button>
              );
            })}
          </div>
          {isProjects ? (
            <Link
              to="/connections"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2.5 border-t border-border px-2.5 pt-3 pb-1.5"
            >
              <Plus className="w-4 h-4 text-accent" aria-hidden />
              <span className="flex flex-1 flex-col">
                <span className="text-[13px] font-bold text-accent">
                  {t("workspace.fetchMore")}
                </span>
                <span className="text-xs text-gray-400">{t("workspace.fetchMoreHint")}</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-accent" aria-hidden />
            </Link>
          ) : (
            <form
              className="mt-1 flex items-center gap-2 border-t border-border px-1 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                applyCustom();
              }}
            >
              <label className="sr-only" htmlFor={`${menuId}-custom`}>
                {t("workspace.otherFolder")}
              </label>
              <input
                id={`${menuId}-custom`}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={t("workspace.otherFolderPlaceholder")}
                className="input flex-1 min-w-0 font-mono text-xs"
              />
              <button type="submit" className="btn-ghost">
                {t("workspace.use")}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
