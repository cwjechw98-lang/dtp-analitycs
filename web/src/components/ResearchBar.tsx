import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";

/**
 * Компактный Research-бар (регион + период) для вкладок, где нужны фильтры
 * исследования, но нет полноценной панели (Fleet, Route). Пишет в тот же
 * ResearchProvider — один источник истины с Atlas.
 */
export default function ResearchBar({ compact = true }: { compact?: boolean }) {
  const app = useApp();
  const { state, dispatch } = useResearch();

  const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const yearMin = app.meta.date_min?.slice(0, 4) ?? "2015";
  const yearMax = app.meta.date_max?.slice(0, 4) ?? "2026";

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${compact ? "text-xs" : "text-sm"}`}>
      <label className="flex items-center gap-1.5 text-slate-500">
        Регион
        <select
          value={app.scope}
          onChange={(e) => app.setScope(e.target.value)}
          className="glass rounded-lg px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="ALL">Вся Россия</option>
          {app.meta.regions.map((r) => (
            <option key={r.slug} value={r.slug}>{r.name}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-slate-500">
        Период
        <input
          type="number"
          value={state.yearMin ?? ""}
          placeholder={yearMin}
          onChange={(e) => dispatch({ type: "years", min: e.target.value ? +e.target.value : null, max: state.yearMax })}
          className="glass w-16 rounded-lg px-2 py-1.5 text-xs text-slate-200"
          min={2015}
          max={2026}
        />
        <span className="text-slate-600">—</span>
        <input
          type="number"
          value={state.yearMax ?? ""}
          placeholder={yearMax}
          onChange={(e) => dispatch({ type: "years", min: state.yearMin, max: e.target.value ? +e.target.value : null })}
          className="glass w-16 rounded-lg px-2 py-1.5 text-xs text-slate-200"
          min={2015}
          max={2026}
        />
      </label>
      {(state.yearMin !== null || state.yearMax !== null || app.scope !== "ALL") && (
        <button
          onClick={() => dispatch({ type: "years", min: null, max: null })}
          className="rounded-md bg-slate-800/80 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
        >
          Сбросить период
        </button>
      )}
    </div>
  );
}
