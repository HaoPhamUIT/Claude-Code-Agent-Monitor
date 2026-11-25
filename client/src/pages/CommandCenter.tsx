/**
 * @file CommandCenter.tsx
 * @description Home page of Pharmacity Agent: give agents work first, watch
 * them second. A large task box sits on top (project or folder, trust level,
 * model, Run); below it the agent inbox lists dashboard-started runs that need
 * you, are working, or just finished, beside the picked run's conversation
 * with a reply box; a one-line monitoring summary closes the page and links to
 * the full dashboard at /monitor.
 *
 * Runs start in conversation mode so the person can keep talking to them. With
 * a project catalog (`DASHBOARD_CONNECTIONS_FILE`) only fetched project folders
 * may be chosen, and a catalog that needs an account still signed out blocks
 * Run and points to the Accounts page; without one any folder may be chosen.
 * Choices (folder, trust level, model) are remembered per browser. The trust
 * level starts at full access; switching back to it from a lower level asks first.
 *
 * Data: `GET /api/run` + `/api/run/history` (polled every 5 s and refreshed on
 * `run_status`), `run_stream` envelopes for the open run, `GET /api/projects`
 * and `GET /api/connections` for the gate and warnings.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { AlertCircle, X } from "lucide-react";
import { api } from "../lib/api";
import type {
  CwdSuggestion,
  DashboardRunHistoryItem,
  ModelChoice,
  RunHandle,
  RunListResponse,
} from "../lib/api";
import type { RunInputAckPayload, RunStreamPayload, WSMessage } from "../lib/types";
import { eventBus } from "../lib/eventBus";
import {
  TRUST_PERMISSION,
  buildInbox,
  connectionWarnings,
  freeChoices,
  pickWorkspace,
  resumableSessions,
  sessionTitle,
  workspaceGate,
  type InboxItem,
  type ResumeTarget,
  type TrustLevel,
  type WorkspaceChoice,
} from "../lib/commandCenter";
import { pathBasename, timeAgo } from "../lib/format";
import type { Session } from "../lib/types";
import { useConnections } from "../hooks/useConnections";
import { useProjects } from "../hooks/useProjects";
import {
  maybeExpandSlashCommand,
  mergeEnvelope,
  transcriptToEnvelopes,
  useSlashCommands,
  useTypewriterEnvelopes,
  type Envelope,
  type HashCompletion,
  type UserMessage,
} from "./Run";
import { COMPOSER_INPUT_ID, Composer } from "../components/command/Composer";
import { AgentInbox } from "../components/command/AgentInbox";
import { RunConversation } from "../components/command/RunConversation";
import { MonitorStrip } from "../components/command/MonitorStrip";
import { ConfirmModal } from "../components/ConfirmModal";

const WORKSPACE_KEY = "pmca.command.workspace";
const TRUST_KEY = "pmca.command.trust";
const MODEL_KEY = "pmca.command.model";
/** Session-local list of account warnings put off with "Later". */
const LATER_KEY = "pmca.command.laterConnections";
const POLL_MS = 5000;
/** How many quick-command chips to show under the task box. */
const QUICK_COMMANDS = 5;

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice still holds for this visit */
  }
}

function readLater(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(LATER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function userEnvelope(text: string): Envelope {
  return { type: "user", message: { content: text } } as UserMessage;
}

export function CommandCenter() {
  const { t } = useTranslation("command");

  // ── Accounts, project catalog and folders ──────────────────────────────
  const { data: connections } = useConnections();
  const connectionKey = (connections?.items ?? [])
    .map((i) => `${i.id}:${String(i.status?.connected)}:${i.job?.state ?? ""}`)
    .join(",");
  const projects = useProjects(connectionKey);
  const gate = useMemo(
    () => workspaceGate(projects.data, projects.loadError),
    [projects.data, projects.loadError]
  );
  const [cwdSuggestions, setCwdSuggestions] = useState<CwdSuggestion[]>([]);
  const [customChoice, setCustomChoice] = useState<WorkspaceChoice | null>(null);
  const choices = useMemo(() => {
    if (gate.kind === "projects") return gate.choices;
    if (gate.kind !== "free") return [];
    const base = freeChoices(cwdSuggestions);
    return customChoice && !base.some((c) => c.path === customChoice.path)
      ? [customChoice, ...base]
      : base;
  }, [gate, cwdSuggestions, customChoice]);
  const [workspacePath, setWorkspacePath] = useState<string | null>(() => readLocal(WORKSPACE_KEY));
  const workspace = useMemo(() => pickWorkspace(choices, workspacePath), [choices, workspacePath]);

  const [later, setLater] = useState<Set<string>>(readLater);
  const warnings = useMemo(
    () =>
      connectionWarnings(connections, gate.kind === "connect" ? gate.connection.id : null, later),
    [connections, gate, later]
  );

  // ── Composer choices ───────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [trust, setTrust] = useState<TrustLevel>(() => {
    const saved = readLocal(TRUST_KEY);
    return saved === "read" || saved === "edit" ? saved : "full";
  });
  const [confirmFull, setConfirmFull] = useState(false);
  const [model, setModel] = useState(() => readLocal(MODEL_KEY) ?? "");
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [binaryMissing, setBinaryMissing] = useState(false);
  const [resume, setResume] = useState<ResumeTarget | null>(null);
  const composerCommands = useSlashCommands(resume?.cwd ?? workspace?.path ?? "");
  const seenSessions = useRef(new Map<string, Session>());

  const sessionCompletion = useMemo<HashCompletion | undefined>(() => {
    if (gate.kind !== "free" && gate.kind !== "projects") return undefined;
    return {
      hint: t("resume.popupHint"),
      search: async (query) => {
        const { sessions } = await api.sessions.list({
          q: query.trim() || undefined,
          provider: "claude",
          sort_by: "started_at",
          sort_desc: true,
          limit: 25,
        });
        return resumableSessions(sessions, gate)
          .slice(0, 8)
          .map((session) => {
            seenSessions.current.set(session.id, session);
            return {
              id: session.id,
              label: sessionTitle(session) || t("inbox.untitled"),
              detail: [
                pathBasename(session.cwd),
                timeAgo(session.last_activity ?? session.started_at),
              ]
                .filter(Boolean)
                .join(" · "),
            };
          });
      },
      onPick: (item) => {
        const session = seenSessions.current.get(item.id);
        if (!session?.cwd) return;
        setResume({ sessionId: session.id, cwd: session.cwd, title: sessionTitle(session) });
      },
    };
  }, [gate, t]);

  useEffect(() => {
    api.run
      .cwds()
      .then((r) => setCwdSuggestions(r.items))
      .catch(() => undefined);
    api.run
      .models("claude")
      .then((r) => setModels(r.items))
      .catch(() => undefined);
    api.run
      .binary("claude")
      .then((r) => setBinaryMissing(!r.found))
      .catch(() => undefined);
  }, []);

  // ── Runs: live handles + history → inbox ───────────────────────────────
  const [live, setLive] = useState<RunListResponse | null>(null);
  const [history, setHistory] = useState<DashboardRunHistoryItem[]>([]);
  const refreshRuns = useCallback(() => {
    api.run
      .list()
      .then(setLive)
      .catch(() => undefined);
    api.run
      .history(30)
      .then((r) => setHistory(r.items))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    refreshRuns();
    const tick = window.setInterval(refreshRuns, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRuns();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshRuns]);
  const inbox = useMemo(() => buildInbox(live?.items ?? [], history), [live, history]);

  // ── The open conversation ──────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const displayEnvelopes = useTypewriterEnvelopes(envelopes);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [reply, setReply] = useState("");
  const pendingReply = useRef("");
  const [busy, setBusy] = useState<"start" | "send" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = inbox.find((i) => i.id === selectedId) ?? null;
  const conversationCommands = useSlashCommands(selected?.cwd ?? "");

  const open = useCallback(
    async (item: InboxItem) => {
      selectedRef.current = item.id;
      setSelectedId(item.id);
      setEnvelopes([]);
      setReply("");
      setLoadingConversation(true);
      try {
        let next: Envelope[] = [];
        let sessionId = item.sessionId;
        if (item.handle) {
          const fetched: RunHandle = await api.run.get(item.id, { envelopes: true });
          next = ((fetched.envelopes as Envelope[] | undefined) ?? []).slice();
          sessionId = fetched.sessionId;
        }
        // The spawner keeps only what this process printed; a resumed run's earlier turns, and
        // runs the server no longer tracks, are only in the session transcript.
        if (sessionId) {
          const canonical = next.filter((e) => {
            const type = (e as { type?: string }).type;
            return type === "user" || type === "assistant";
          }).length;
          try {
            const transcript = await api.sessions.transcript(sessionId, { limit: 200 });
            const fromDisk = transcriptToEnvelopes(transcript.messages);
            if (fromDisk.length > canonical) next = fromDisk;
          } catch {
            /* keep what the spawner had */
          }
        }
        if (selectedRef.current === item.id) setEnvelopes(next);
      } catch (err) {
        if (selectedRef.current === item.id) {
          setError(t("errors.loadFailed", { message: messageOf(err) }));
        }
      } finally {
        if (selectedRef.current === item.id) setLoadingConversation(false);
      }
    },
    [t]
  );

  // Open the most urgent agent once, when the page first has runs to show.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || selectedRef.current || inbox.length === 0) return;
    autoOpened.current = true;
    const first = inbox[0];
    if (first && first.group !== "finished") void open(first);
  }, [inbox, open]);

  // Stream the open run; refresh the inbox when any run changes state or ends a turn.
  useEffect(() => {
    return eventBus.subscribe((msg: WSMessage) => {
      if (msg.type === "run_stream") {
        const p = msg.data as RunStreamPayload;
        const env = p.envelope as Envelope;
        if (p.id === selectedRef.current) {
          flushSync(() => setEnvelopes((prev) => mergeEnvelope(prev, env)));
        }
        if ((env as { type?: string }).type === "result") refreshRuns();
      } else if (msg.type === "run_status") {
        refreshRuns();
      } else if (msg.type === "run_input_ack") {
        const p = msg.data as RunInputAckPayload;
        if (p.id === selectedRef.current && pendingReply.current) {
          const text = pendingReply.current;
          pendingReply.current = "";
          setEnvelopes((prev) => [...prev, userEnvelope(text)]);
        }
        refreshRuns();
      }
    });
  }, [refreshRuns]);

  // ── Actions ────────────────────────────────────────────────────────────
  const chooseWorkspace = (choice: WorkspaceChoice) => {
    if (gate.kind === "free" && !choices.some((c) => c.path === choice.path)) {
      setCustomChoice(choice);
    }
    setWorkspacePath(choice.path);
    writeLocal(WORKSPACE_KEY, choice.path);
  };

  const chooseTrust = (level: TrustLevel) => {
    if (level === trust) return;
    if (level === "full") {
      setConfirmFull(true);
      return;
    }
    setTrust(level);
    writeLocal(TRUST_KEY, level);
  };

  const chooseModel = (next: string) => {
    setModel(next);
    writeLocal(MODEL_KEY, next);
  };

  const putOff = (id: string) => {
    setLater((prev) => {
      const next = new Set(prev).add(id);
      try {
        window.sessionStorage.setItem(LATER_KEY, JSON.stringify([...next]));
      } catch {
        /* storage blocked: "Later" still holds for this page load */
      }
      return next;
    });
  };

  /** Adopt a freshly started run: show it in the inbox at once and open it. */
  const adopt = (handle: RunHandle, seed: Envelope[]) => {
    setLive((prev) => ({
      items: [handle, ...(prev?.items ?? []).filter((h) => h.id !== handle.id)],
      maxConcurrent: prev?.maxConcurrent ?? 0,
      activeCount: (prev?.activeCount ?? 0) + 1,
    }));
    selectedRef.current = handle.id;
    setSelectedId(handle.id);
    setEnvelopes(seed);
    setLoadingConversation(false);
    refreshRuns();
  };

  const run = async () => {
    const cwd = resume?.cwd ?? workspace?.path;
    if (!cwd || !prompt.trim() || busy) return;
    setBusy("start");
    setError(null);
    try {
      const expanded = await maybeExpandSlashCommand(prompt, composerCommands);
      const [handle, earlier] = await Promise.all([
        api.run.start({
          prompt: expanded,
          mode: "conversation",
          provider: "claude",
          cwd,
          model: model || undefined,
          permissionMode: TRUST_PERMISSION[trust],
          resumeSessionId: resume?.sessionId,
        }),
        resume
          ? api.sessions
              .transcript(resume.sessionId, { limit: 200 })
              .then((r) => transcriptToEnvelopes(r.messages))
              .catch(() => [] as Envelope[])
          : Promise.resolve([] as Envelope[]),
      ]);
      adopt(handle, [...earlier, userEnvelope(prompt)]);
      setPrompt("");
      setResume(null);
    } catch (err) {
      setError(t("errors.startFailed", { message: messageOf(err) }));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    const item = selected;
    const text = reply.trim();
    if (!item || !text || busy) return;
    setBusy("send");
    setError(null);
    try {
      const expanded = await maybeExpandSlashCommand(text, conversationCommands);
      const liveRun = item.status === "spawning" || item.status === "running";
      if (liveRun) {
        pendingReply.current = text;
        await api.run.send(item.id, expanded, item.provider);
      } else if (item.sessionId) {
        const handle = await api.run.start({
          prompt: expanded,
          mode: "conversation",
          provider: item.provider,
          cwd: item.cwd || undefined,
          model: item.model || undefined,
          permissionMode: (item.permissionMode as RunHandle["permissionMode"]) || undefined,
          resumeSessionId: item.sessionId,
        });
        adopt(handle, [...envelopes, userEnvelope(text)]);
      }
      setReply("");
    } catch (err) {
      pendingReply.current = "";
      setError(t("errors.sendFailed", { message: messageOf(err) }));
    } finally {
      setBusy(null);
    }
  };

  const stop = async () => {
    if (!selected || busy) return;
    setBusy("stop");
    setError(null);
    try {
      await api.run.kill(selected.id);
      refreshRuns();
    } catch (err) {
      setError(t("errors.stopFailed", { message: messageOf(err) }));
    } finally {
      setBusy(null);
    }
  };

  const quickCommands = composerCommands
    .filter((c) => c.source !== "builtin")
    .slice(0, QUICK_COMMANDS);
  const insertCommand = (name: string) => {
    setPrompt(`/${name} `);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(COMPOSER_INPUT_ID) as HTMLTextAreaElement | null;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const connectionPills = connections?.enabled && !connections.error ? connections.items : [];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[16rem] flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-100">
            <label htmlFor={COMPOSER_INPUT_ID}>{t("title")}</label>
          </h1>
          <p className="text-[13px] text-gray-400">{t("subtitle")}</p>
        </div>
        {connectionPills.map((item) => {
          const state = item.status?.connected;
          const label =
            state === true
              ? t("connections.connected", { name: item.name })
              : state === false
                ? t("connections.disconnected", { name: item.name })
                : t("connections.checking", { name: item.name });
          return (
            <Link
              key={item.id}
              to="/connections"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                state === false
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                  : "border-border bg-surface-1 text-gray-400 hover:text-gray-200"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  state === true
                    ? "bg-emerald-400"
                    : state === false
                      ? "bg-amber-400"
                      : "bg-gray-500"
                }`}
                aria-hidden
              />
              {label}
            </Link>
          );
        })}
      </div>

      <Composer
        prompt={prompt}
        onPromptChange={setPrompt}
        gate={gate}
        choices={choices}
        workspace={workspace}
        onWorkspaceChange={chooseWorkspace}
        trust={trust}
        onTrustChange={chooseTrust}
        model={model}
        models={models}
        onModelChange={chooseModel}
        slashCommands={composerCommands}
        warnings={warnings}
        onDismissWarning={putOff}
        binaryMissing={binaryMissing}
        starting={busy === "start"}
        onRun={() => void run()}
        resume={resume}
        onClearResume={() => setResume(null)}
        hashCompletion={sessionCompletion}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          <span>
            <kbd className="mr-1.5 rounded border border-border-light bg-surface-1 px-1.5 font-sans text-[11px] font-bold text-gray-200">
              /
            </kbd>
            {t("composer.hintSlash")}
          </span>
          <span>
            <kbd className="mr-1.5 rounded border border-border-light bg-surface-1 px-1.5 font-sans text-[11px] font-bold text-gray-200">
              @
            </kbd>
            {t("composer.hintAt")}
          </span>
          {sessionCompletion && (
            <span>
              <kbd className="mr-1.5 rounded border border-border-light bg-surface-1 px-1.5 font-sans text-[11px] font-bold text-gray-200">
                #
              </kbd>
              {t("composer.hintHash")}
            </span>
          )}
          <span>{t("composer.enterHint")}</span>
        </div>
        <span className="flex-1" />
        {quickCommands.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">{t("composer.templates")}</span>
            {quickCommands.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.description}
                onClick={() => insertCommand(c.name)}
                className="min-h-[36px] rounded-full border border-border bg-surface-1 px-3 font-mono text-xs text-gray-200 hover:border-accent/40 hover:bg-surface-4"
              >
                /{c.name}
              </button>
            ))}
          </div>
        )}
        <Link to="/run" className="text-xs font-semibold text-accent hover:text-accent-hover">
          {t("composer.advanced")}
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          <span className="flex-1 break-words">{error}</span>
          <button
            type="button"
            aria-label={t("errors.dismiss")}
            onClick={() => setError(null)}
            className="rounded p-1 text-red-300/70 hover:text-red-200"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      )}

      <div className="grid min-h-0 gap-4 lg:h-[min(72vh,760px)] lg:grid-cols-[minmax(280px,360px)_1fr]">
        <AgentInbox items={inbox} selectedId={selectedId} onSelect={(item) => void open(item)} />
        <div className="flex min-h-[420px] flex-col lg:min-h-0">
          <RunConversation
            item={selected}
            envelopes={displayEnvelopes}
            loading={loadingConversation}
            reply={reply}
            onReplyChange={setReply}
            onSend={() => void send()}
            onStop={() => void stop()}
            sending={busy === "send"}
            stopping={busy === "stop"}
            slashCommands={conversationCommands}
          />
        </div>
      </div>

      <MonitorStrip />

      <ConfirmModal
        open={confirmFull}
        title={t("trust.confirmTitle")}
        message={t("trust.confirmBody")}
        confirmLabel={t("trust.confirm")}
        cancelLabel={t("trust.cancel")}
        destructive
        onConfirm={() => {
          setTrust("full");
          writeLocal(TRUST_KEY, "full");
          setConfirmFull(false);
        }}
        onCancel={() => setConfirmFull(false)}
      />
    </div>
  );
}
