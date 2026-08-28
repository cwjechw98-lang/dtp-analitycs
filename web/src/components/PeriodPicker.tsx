import { useResearch } from "../state/ResearchContext";
import { useApp } from "../state/AppState";

/**
 * Красивый выбор периода: два аккуратных выпадающих списка (без внешних
 * стрелок number-input) + кнопки ◀ ▶, сдвигающие диапазон на 1 год.
 * Пишет в единый ResearchProvider.
 */
export default function PeriodPicker({ compact = false }: { compact?: boolean }) {
  const app = useApp();
  const { state, dispatch } = useResearch();

  const first = Number(app.meta.date_min?.slice(0, 4) ?? 2015);
  const last = Number(app.meta.date_max?.slice(0, 4) ?? 2026);
  const lo = state.yearMin ?? first;
  const hi = state.yearMax ?? last;

  const setRange = (min: number | null, max: number | null) => dispatch({ type: "years", min, max });

  const stepLeft = () => {
    const newLo = Math.max(first, lo - 1);
    // при смещении влево удерживаем ширину диапазона
    const width = hi - lo;
    const newHi = Math.min(last, newLo + width);
    setRange(newLo, newHi);
  };
  const stepRight = () => {
    const width = hi - lo;
    const newHi = Math.min(last, hi + 1);
    const newLo = Math.max(first, newHi - width);
    setRange(newLo, newHi);
  };

  const selectCls = `glass rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 ${compact ? "w-15" : "w-16"}`;
  const btnCls = "grid h-7 w-7 place-items-center rounded-lg border border-slate-700/70 bg-slate-800/70 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-30";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={stepLeft} disabled={lo <= first} className={btnCls} aria-label="Период на год раньше">◀</button>
      <select value={lo} onChange={(e) => setRange(+e.target.value, hi)} className={selectCls} aria-label="Начало периода">
        {Array.from({ length: last - first + 1 }, (_, i) => first + i).map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <span className="text-xs text-slate-500">—</span>
      <select value={hi} onChange={(e) => setRange(lo, +e.target.value)} className={selectCls} aria-label="Конец периода">
        {Array.from({ length: last - first + 1 }, (_, i) => first + i).map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button type="button" onClick={stepRight} disabled={hi >= last} className={btnCls} aria-label="Период на год позже">▶</button>
    </div>
  );
}
