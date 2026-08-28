import { useMemo } from "react";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";

/**
 * Компактная строка состояния исследования.
 * Чипы активных фильтров + «Изменить фильтры» (открывает ResearchSheet) + «Сбросить».
 * Карта при этом никогда не ужимается — панель выезжает поверх.
 */
export default function ResearchFilterBar({ onOpen }: { onOpen: () => void }) {
  const app = useApp();
  const { state, dispatch } = useResearch();

  const chips = useMemo(() => {
    const out: string[] = [];
    // регион
    if (app.scope !== "ALL") {
      const r = app.meta.regions.find((x) => x.slug === app.scope);
      if (r) out.push(r.name);
    }
    // период
    if (state.yearMin !== null || state.yearMax !== null) {
      const a = state.yearMin ?? "2015", b = state.yearMax ?? "2026";
      out.push(a === b ? String(a) : `${a}–${b}`);
    }
    // тяжесть (по словарю)
    if (state.severities.length) {
      out.push(state.severities.map((i) => app.dicts.sevs[i]).filter(Boolean).join(", "));
    }
    // ТС
    if (state.vehSupers.length) {
      const names = state.vehSupers.map((i) => app.dicts.veh_supers[i]).filter(Boolean);
      if (names.length) out.push(names.join(" + "));
    }
    return out.slice(0, 3); // максимум 3 чипа + счётчик «+N»
  }, [app, state]);

  const extraCount = useMemo(() => {
    let n = 0;
    if (state.crashCategories.length) n++;
    if (state.weathers.length) n++;
    if (state.lights.length) n++;
    if (state.roads.length) n++;
    if (state.partTypes.length) n++;
    if (state.outcomes.length) n++;
    if (state.infra.length) n++;
    if (state.brands.length) n++;
    return n;
  }, [state]);

  const hasAny =
    chips.length > 0 || extraCount > 0 ||
    state.crashCategories.length || state.weathers.length || state.lights.length || state.roads.length ||
    state.partTypes.length || state.outcomes.length || state.infra.length || state.brands.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className="rounded-full border border-slate-700/70 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-200"
        >
          {c}
        </span>
      ))}
      {extraCount > 0 && (
        <span className="rounded-full border border-slate-700/70 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-400">
          +{extraCount} фильтра
        </span>
      )}
      {!hasAny && (
        <span className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-500">
          Вся Россия · весь период
        </span>
      )}
      <button
        onClick={onOpen}
        className="rounded-lg border border-slate-700/70 bg-slate-800/70 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500"
      >
        ⚙ Изменить фильтры
      </button>
      {hasAny && (
        <button
          onClick={() => dispatch({ type: "reset" })}
          className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:text-slate-200"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
