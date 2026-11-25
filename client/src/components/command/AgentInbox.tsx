/**
 * @file AgentInbox.tsx
 * @description The command centre's list of dashboard-started agents, in three
 * sections: ones waiting for your reply, ones still working (with their last
 * tool call and TodoWrite step), and recently finished ones. Picking a row
 * opens its conversation beside the list.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useTranslation } from "react-i18next";
import { Bot, CircleCheck, MessageSquareText, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { InboxGroup, InboxItem } from "../../lib/commandCenter";
import { timeAgo } from "../../lib/format";

const SECTIONS: { group: InboxGroup; dot: string }[] = [
  { group: "needsYou", dot: "bg-amber-400" },
  { group: "working", dot: "bg-accent" },
  { group: "finished", dot: "bg-emerald-400" },
];

/** Relative time for an epoch-ms timestamp. */
function ago(ms: number): string {
  return Number.isFinite(ms) ? timeAgo(new Date(ms).toISOString()) : "";
}

export interface AgentInboxProps {
  items: InboxItem[];
  selectedId: string | null;
  onSelect: (item: InboxItem) => void;
}

export function AgentInbox({ items, selectedId, onSelect }: AgentInboxProps) {
  const { t } = useTranslation("command");
  return (
    <section
      aria-labelledby="agent-inbox-title"
      className="card flex min-h-0 flex-col gap-1 overflow-hidden p-3"
    >
      <div className="flex items-center gap-2 px-1 pb-1">
        <h2 id="agent-inbox-title" className="text-sm font-bold text-gray-100">
          {t("inbox.title")}
        </h2>
        <span className="rounded-full bg-surface-4 px-2 py-0.5 text-[11px] font-bold text-gray-400">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <Bot className="w-6 h-6 text-gray-500" aria-hidden />
          <p className="text-[13px] text-gray-400">{t("inbox.empty")}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {SECTIONS.map(({ group, dot }) => {
            const rows = items.filter((i) => i.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                <div className="flex items-center gap-2 px-1 pt-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {t(`inbox.${group}`)} · {rows.length}
                  </h3>
                </div>
                {rows.map((item) => (
                  <InboxRow
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InboxRow({
  item,
  selected,
  onSelect,
}: {
  item: InboxItem;
  selected: boolean;
  onSelect: (item: InboxItem) => void;
}) {
  const { t } = useTranslation("command");
  const failed = item.status === "error";
  let Icon: LucideIcon = Bot;
  let tone = "bg-accent/10 text-accent";
  if (item.group === "needsYou") {
    Icon = MessageSquareText;
    tone = "bg-amber-500/15 text-amber-400";
  } else if (item.group === "finished") {
    Icon = failed ? TriangleAlert : CircleCheck;
    tone = failed ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400";
  }

  let detail: string;
  let mono = false;
  if (item.group === "needsYou") {
    detail = t("inbox.waitingReply");
  } else if (item.group === "working") {
    detail = item.lastActivity ?? t("inbox.thinking");
    mono = item.lastActivity !== null;
  } else {
    detail = t(`inbox.status.${item.status}`);
  }
  const when =
    item.group === "working" && item.progress
      ? t("inbox.step", { done: item.progress.done, total: item.progress.total })
      : ago(item.endedAt ?? item.startedAt);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(item)}
      className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
        selected ? "border-accent/30 bg-accent/10" : "border-transparent hover:bg-surface-4"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        <Icon className="w-4 h-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-100">
            {item.title || t("inbox.untitled")}
          </span>
          <span className="shrink-0 text-[11px] text-gray-500">{when}</span>
        </span>
        <span className={`truncate text-xs text-gray-400 ${mono ? "font-mono text-[11.5px]" : ""}`}>
          {detail}
        </span>
      </span>
    </button>
  );
}
