/**
 * @file MonitorStrip.tsx
 * @description One-line monitoring summary at the foot of the command centre:
 * session, agent and event counters plus total cost, refreshed every 15
 * seconds, with a link to the full monitoring dashboard. Failed reads keep the
 * last numbers (or dashes) and never block the page.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Activity, ArrowRight } from "lucide-react";
import { api } from "../../lib/api";
import { fmt, fmtCost } from "../../lib/format";
import type { Stats } from "../../lib/types";

const REFRESH_MS = 15_000;

export function MonitorStrip() {
  const { t } = useTranslation("command");
  const [stats, setStats] = useState<Stats | null>(null);
  const [cost, setCost] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api.stats
        .get()
        .then((s) => alive && setStats(s))
        .catch(() => undefined);
    };
    load();
    api.pricing
      .totalCost()
      .then((c) => alive && setCost(c.total_cost))
      .catch(() => undefined);
    const tick = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(tick);
    };
  }, []);

  const figures: { label: string; value: string }[] = [
    { label: t("monitor.sessions"), value: stats ? fmt(stats.total_sessions) : "—" },
    { label: t("monitor.activeSessions"), value: stats ? fmt(stats.active_sessions) : "—" },
    { label: t("monitor.activeAgents"), value: stats ? fmt(stats.active_agents) : "—" },
    { label: t("monitor.eventsToday"), value: stats ? fmt(stats.events_today) : "—" },
    { label: t("monitor.totalCost"), value: cost !== null ? fmtCost(cost) : "—" },
  ];

  return (
    <section
      aria-labelledby="monitor-strip-title"
      className="card flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3"
    >
      <h2
        id="monitor-strip-title"
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-100"
      >
        <Activity className="w-4 h-4 text-gray-400" aria-hidden />
        {t("monitor.title")}
      </h2>
      {figures.map((f) => (
        <div key={f.label}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {f.label}
          </div>
          <div className="text-[13px] font-semibold text-gray-100">{f.value}</div>
        </div>
      ))}
      <span className="flex-1" />
      <Link
        to="/monitor"
        className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-bold text-accent hover:text-accent-hover"
      >
        {t("monitor.open")}
        <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </Link>
    </section>
  );
}
