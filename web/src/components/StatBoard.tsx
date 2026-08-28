import { useMemo } from "react";
import SplitFlap from "./SplitFlap";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";
import { deriveRegion } from "../lib/derive";

/**
 * Широкая панель статистики с самолётным табло.
 * Отдельный полноширинный ряд — цифрам есть место (в тесных карточках
 * табло обрезалось). Показывает срез текущего исследования: N ДТП,
 * погибшие, раненые — и перелистывается при смене фильтров.
 */
export default function StatBoard() {
  const app = useApp();
  const { filteredRows } = useResearch();

  const stats = useMemo(() => {
    if (app.scope === "ALL" || !app.regionFile) return null;
    const slice = filteredRows(app.regionFile.rows);
    const d = deriveRegion(slice, app.dicts);
    return d ? { total: d.total, dead: d.dead, injured: d.injured } : null;
  }, [app, filteredRows]);

  if (!stats) return null;

  return (
    <div className="glass rounded-2xl border border-slate-800/80 p-5">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-slate-500">
        В срезе исследования
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <SplitFlap value={stats.total} label="ДТП" accent="#f97316" />
        <SplitFlap value={stats.dead} label="погибли" accent="#ef4444" />
        <SplitFlap value={stats.injured} label="ранены" accent="#f59e0b" />
      </div>
    </div>
  );
}
