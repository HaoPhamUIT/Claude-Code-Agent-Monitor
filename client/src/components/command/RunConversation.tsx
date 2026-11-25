/**
 * @file RunConversation.tsx
 * @description The command centre's conversation pane for the agent picked in
 * the inbox: a header with its state, project, trust level and actions (stop,
 * copy the terminal resume command, open the session), its TodoWrite progress,
 * the chat with each run of tool calls folded into one expandable line, and a
 * reply box. Replying to a live conversation sends a follow-up; replying to a
 * finished one resumes its session. Codex runs keep the Run page's renderer.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowUp, ChevronRight, Copy, ExternalLink, MessageSquareText, Square } from "lucide-react";
import {
  chatItems,
  resumeCommand,
  toolTally,
  trustFromPermission,
  type ChatItem,
  type InboxItem,
} from "../../lib/commandCenter";
import { announceAction } from "../../lib/appEvents";
import { pathBasename, timeAgo } from "../../lib/format";
import { MarkdownContent } from "../conversation/MarkdownContent";
import { EnvelopeRow, PromptEditor, type Envelope, type SlashCommand } from "../../pages/Run";

export interface RunConversationProps {
  item: InboxItem | null;
  envelopes: Envelope[];
  loading: boolean;
  reply: string;
  onReplyChange: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  sending: boolean;
  stopping: boolean;
  slashCommands: SlashCommand[];
}

export function RunConversation(props: RunConversationProps) {
  const { t } = useTranslation("command");
  const { item } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);
  const items = useMemo(() => chatItems(props.envelopes), [props.envelopes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setPinned(el.scrollHeight - (el.scrollTop + el.clientHeight) < 80);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [item?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [props.envelopes, pinned]);

  if (!item) {
    return (
      <section className="card flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <MessageSquareText className="w-7 h-7 text-gray-500" aria-hidden />
        <h2 className="text-sm font-bold text-gray-100">{t("conversation.emptyTitle")}</h2>
        <p className="max-w-sm text-[13px] text-gray-400">{t("conversation.emptyBody")}</p>
      </section>
    );
  }

  const live = item.status === "spawning" || item.status === "running";
  const canReply = (live && item.mode === "conversation") || (!live && item.sessionId !== null);
  const trust = trustFromPermission(item.permissionMode);
  const meta = [
    pathBasename(item.cwd) ?? item.cwd,
    trust ? t(`trust.${trust}`) : null,
    t("conversation.started", { ago: timeAgo(new Date(item.startedAt).toISOString()) }),
  ].filter(Boolean);

  let badge: { label: string; tone: string };
  if (item.group === "needsYou") {
    badge = { label: t("conversation.needsYou"), tone: "bg-amber-500/15 text-amber-400" };
  } else if (item.group === "working") {
    badge = { label: t("conversation.working"), tone: "bg-accent/10 text-accent" };
  } else {
    badge = {
      label: t(`inbox.status.${item.status}`),
      tone:
        item.status === "error"
          ? "bg-red-500/10 text-red-400"
          : item.status === "completed"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-surface-4 text-gray-400",
    };
  }

  let placeholder = t("conversation.replyPlaceholder");
  if (!live) placeholder = t("conversation.resumePlaceholder");
  else if (item.group === "working") placeholder = t("conversation.followUpPlaceholder");

  const copyResume = async () => {
    if (!item.sessionId) return;
    const command = resumeCommand(item.sessionId);
    try {
      await navigator.clipboard.writeText(command);
      announceAction(t("conversation.copied", { command }));
    } catch {
      /* clipboard blocked: nothing to undo */
    }
  };

  return (
    <section
      aria-labelledby="run-conversation-title"
      className="card flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="run-conversation-title" className="text-base font-bold text-gray-100">
              {item.title || t("inbox.untitled")}
            </h2>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${badge.tone}`}>
              {badge.label}
            </span>
          </div>
          <span className="text-xs text-gray-500">{meta.join(" · ")}</span>
        </div>
        {live && (
          <button
            type="button"
            onClick={props.onStop}
            disabled={props.stopping}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-gray-400 hover:bg-surface-4 hover:text-gray-200 disabled:opacity-60"
          >
            <Square className="w-3.5 h-3.5" aria-hidden />
            {props.stopping ? t("conversation.stopping") : t("conversation.stop")}
          </button>
        )}
        {item.sessionId && (
          <>
            <button
              type="button"
              onClick={() => void copyResume()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-light px-3 text-[13px] font-medium text-gray-200 hover:bg-surface-4"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden />
              {t("conversation.copyResume")}
            </button>
            <Link
              to={`/sessions/${encodeURIComponent(item.sessionId)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-accent hover:bg-surface-4"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              {t("conversation.viewSession")}
            </Link>
          </>
        )}
      </header>

      {item.progress && item.progress.total > 0 && (
        <ProgressBar done={item.progress.done} total={item.progress.total} />
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-2 px-4 py-4"
      >
        {props.loading ? (
          <p className="text-[13px] text-gray-500">{t("conversation.loading")}</p>
        ) : item.provider === "codex" ? (
          props.envelopes.map((env, i) => <EnvelopeRow key={i} envelope={env} />)
        ) : items.length === 0 ? (
          <p className="text-[13px] text-gray-500">{t("conversation.noMessages")}</p>
        ) : (
          items.map((chat, i) => <ChatRow key={i} item={chat} />)
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        {canReply ? (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <PromptEditor
                value={props.reply}
                onChange={props.onReplyChange}
                onSubmit={props.onSend}
                submitOnEnter
                rows={1}
                placeholder={placeholder}
                slashCommands={props.slashCommands}
                fileCwd={item.cwd}
                textareaClassName="w-full resize-none rounded-lg border border-border-light bg-surface-1 px-3.5 py-2.5 text-sm leading-relaxed text-gray-100 placeholder:text-gray-500 focus:border-accent focus:outline-none font-sans"
              />
            </div>
            <button
              type="button"
              aria-label={t("conversation.send")}
              onClick={props.onSend}
              disabled={!props.reply.trim() || props.sending}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-5 disabled:text-gray-500"
            >
              <ArrowUp className="w-4.5 h-4.5" aria-hidden />
            </button>
          </div>
        ) : (
          <p className="text-[13px] text-gray-500">{t("conversation.cannotContinue")}</p>
        )}
      </div>
    </section>
  );
}

/** Segmented TodoWrite progress: one segment per todo item. */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation("command");
  const segments = Math.min(total, 12);
  const filled = Math.round((done / total) * segments);
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
      <div
        className="flex flex-1 gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={t("conversation.progress", { done, total })}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < filled ? "bg-accent" : "bg-surface-5"}`}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs font-semibold text-gray-400">
        {t("conversation.progress", { done, total })}
      </span>
    </div>
  );
}

function ChatRow({ item }: { item: ChatItem }) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-sm leading-relaxed text-white">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-gray-200">
        <MarkdownContent text={item.text} />
        {item.streaming && (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
        )}
      </div>
    );
  }
  return <ToolGroup calls={item.calls} />;
}

/** A run of tool calls folded into one line that expands to the full list. */
function ToolGroup({ calls }: { calls: { name: string; detail: string }[] }) {
  const { t } = useTranslation("command");
  const [open, setOpen] = useState(false);
  const tally = toolTally(calls)
    .map(({ name, count }) => (count > 1 ? `${name} ×${count}` : name))
    .join(", ");
  return (
    <div className="max-w-[88%]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 text-left text-xs text-gray-400 hover:bg-surface-4"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="font-semibold">
          {t("conversation.toolsUsed", { count: calls.length })}
        </span>
        <span className="truncate text-gray-500">{tally}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l-2 border-border pl-3">
          {calls.map((call, i) => (
            <li key={i} className="font-mono text-[11.5px] text-gray-400">
              <span className="font-semibold text-gray-200">{call.name}</span>
              {call.detail ? ` ${call.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
