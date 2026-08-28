import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";
import PeriodPicker from "./PeriodPicker";

/**
 * Компактный Research-бар (регион + период) для вкладок, где нужны фильтры
 * исследования, но нет полноценной панели (Fleet, Route). Пишет в тот же
 * ResearchProvider — один источник истины с Atlas.
 */
export default function ResearchBar({ compact = true }: { compact?: boolean }) {
  const app = useApp();
  const { state, dispatch } = useResearch();

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
        <PeriodPicker compact={compact} />
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
