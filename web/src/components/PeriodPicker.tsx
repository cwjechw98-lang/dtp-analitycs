import { useResearch } from "../state/ResearchContext";
import { useApp } from "../state/AppState";

/**
 * Красивый выбор периода: два широких выпадающих списка (без внешних стрелок
 * number-input). Полные годы видны, ничего не закрывается. Пишет в ResearchProvider.
 */
export default function PeriodPicker({ compact = false }: { compact?: boolean }) {
  const app = useApp();
  const { state, dispatch } = useResearch();

  const first = Number(app.meta.date_min?.slice(0, 4) ?? 2015);
  const last = Number(app.meta.date_max?.slice(0, 4) ?? 2026);
  const lo = state.yearMin ?? first;
  const hi = state.yearMax ?? last;
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const setRange = (min: number | null, max: number | null) => dispatch({ type: "years", min, max });

  const selCls = `glass rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 ${compact ? "w-20" : "w-24"}`;

  return (
    <div className="flex items-center gap-1.5">
      <select value={lo} onChange={(e) => setRange(+e.target.value, hi)} className={selCls} aria-label="Начало периода">
        {years.map((y) => (<option key={y} value={y}>{y}</option>))}
      </select>
      <span className="text-xs text-slate-500">—</span>
      <select value={hi} onChange={(e) => setRange(lo, +e.target.value)} className={selCls} aria-label="Конец периода">
        {years.map((y) => (<option key={y} value={y}>{y}</option>))}
      </select>
    </div>
  );
}
