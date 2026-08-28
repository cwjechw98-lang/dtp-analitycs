import { useMemo, useState } from "react";
import { useResearch } from "../state/ResearchContext";
import { useApp } from "../state/AppState";
import { Section } from "./ui";
import Combobox from "./Combobox";

/**
 * Research-фильтр-панель (Этап C). Guided-first: по умолчанию 5–6 понятных
 * контролов. Кнопка «Все фильтры» раскрывает Research Layer (полный набор).
 * Все контролы пишут в единый ResearchProvider state — один источник истины.
 */

/** Ограничиваем число отображаемых опций в чипах, чтобы не перегружать. */
function chipToggle(label: string, selected: boolean, onClick: () => void) {
  return (
    <button
      key={label}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        selected
          ? "border-transparent text-white"
          : "border-slate-800/80 text-slate-400 hover:text-slate-200"
      }`}
      style={selected ? { backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)" } : undefined}
    >
      {label}
    </button>
  );
}

function ChipGroup({ title, options, selected, onToggle }: {
  title: string;
  options: { label: string; value: number }[];
  selected: number[];
  onToggle: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => chipToggle(o.label, selected.includes(o.value), () => onToggle(o.value)))}
      </div>
    </div>
  );
}

function toggleIn(arr: number[], v: number): number[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/**
 * Выбор региона через стилизованный Combobox (не нативный select —
 * системный дропдаун плохо читается на тёмной теме). Поиск по мере ввода.
 */
function RegionPicker() {
  const app = useApp();
  const [q, setQ] = useState("");

  const options = useMemo(() => {
    const all: { key: string; label: string; value: string }[] = [
      { key: "ALL", label: "Вся Россия", value: "ALL" },
      ...app.meta.regions.map((r) => ({ key: r.slug, label: r.name, value: r.slug })),
    ];
    const s = q.trim().toLowerCase();
    return s ? all.filter((o) => o.label.toLowerCase().includes(s)) : all;
  }, [app.meta.regions, q]);

  const current = app.scope === "ALL" ? "Вся Россия" : app.meta.regions.find((r) => r.slug === app.scope)?.name ?? "Вся Россия";

  return (
    <Combobox
      value={q || current}
      placeholder="Регион…"
      options={options}
      onQueryChange={setQ}
      onPick={(opt) => {
        setQ("");
        app.setScope(opt.value);
      }}
      className="text-xs"
    />
  );
}

export default function ResearchFilters() {
  const app = useApp();
  const { state, dispatch } = useResearch();
  const [advanced, setAdvanced] = useState(false);

  const sevOpts = [
    { label: "Лёгкие", value: 0 },
    { label: "Тяжёлые", value: 1 },
    { label: "С погибшими", value: 2 },
  ];
  const catOpts = app.dicts.cats.map((c, i) => ({ label: c, value: i }));
  const weatherOpts = app.dicts.weathers.map((w, i) => ({ label: w, value: i }));
  const lightOpts = app.dicts.lights.map((l, i) => ({ label: l, value: i }));
  const roadOpts = app.dicts.roads.map((r, i) => ({ label: r, value: i }));
  const vehOpts = app.dicts.veh_supers.map((v, i) => ({ label: v, value: i }));
  const partOpts = app.dicts.part_types.map((p, i) => ({ label: p, value: i }));
  const outOpts = app.dicts.outcome_groups.map((o, i) => ({ label: o, value: i }));
  const infraOpts = app.dicts.infra_facets.map((x, i) => ({ label: x, value: i }));

  const years = app.meta.regions.length ? app.meta.date_min?.slice(0, 4) ?? "2015" : "2015";
  const yearNow = app.meta.date_max?.slice(0, 4) ?? "2026";

  return (
    <Section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Исследование</h2>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="rounded-lg border border-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
        >
          {advanced ? "Скрыть фильтры" : "Все фильтры"}
        </button>
      </div>

      {/* Guided-first: география + период + тяжесть + ТС */}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Регион</div>
          <RegionPicker />
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Период</div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <select
              value={state.yearMin ?? years}
              onChange={(e) => dispatch({ type: "years", min: +e.target.value, max: state.yearMax })}
              className="glass rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="">с начала</option>
              {[2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span>—</span>
            <select
              value={state.yearMax ?? yearNow}
              onChange={(e) => dispatch({ type: "years", min: state.yearMin, max: +e.target.value })}
              className="glass rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="">до конца</option>
              {[2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {state.yearMax === 2026 && state.yearMin !== 2026 && (
            <div className="mt-1 text-[11px] text-amber-400/90">Данные за 2026 год неполные.</div>
          )}
        </div>

        <ChipGroup title="Тяжесть" options={sevOpts} selected={state.severities}
          onToggle={(v) => dispatch({ type: "severities", value: toggleIn(state.severities, v) })} />
      </div>

      <div className="mt-4">
        <ChipGroup title="Тип транспорта" options={vehOpts} selected={state.vehSupers}
          onToggle={(v) => dispatch({ type: "vehSupers", value: toggleIn(state.vehSupers, v) })} />
      </div>

      {advanced && (
        <div className="mt-4 space-y-4">
          <ChipGroup title="Категория ДТП" options={catOpts} selected={state.crashCategories}
            onToggle={(v) => dispatch({ type: "crashCategories", value: toggleIn(state.crashCategories, v) })} />
          <ChipGroup title="Участники" options={partOpts} selected={state.partTypes}
            onToggle={(v) => dispatch({ type: "partTypes", value: toggleIn(state.partTypes, v) })} />
          <ChipGroup title="Исход" options={outOpts} selected={state.outcomes}
            onToggle={(v) => dispatch({ type: "outcomes", value: toggleIn(state.outcomes, v) })} />
          <ChipGroup title="Инфраструктура" options={infraOpts} selected={state.infra}
            onToggle={(v) => dispatch({ type: "infra", value: toggleIn(state.infra, v) })} />
          <ChipGroup title="Погода" options={weatherOpts} selected={state.weathers}
            onToggle={(v) => dispatch({ type: "weathers", value: toggleIn(state.weathers, v) })} />
          <ChipGroup title="Освещение" options={lightOpts} selected={state.lights}
            onToggle={(v) => dispatch({ type: "lights", value: toggleIn(state.lights, v) })} />
          <ChipGroup title="Дорога" options={roadOpts} selected={state.roads}
            onToggle={(v) => dispatch({ type: "roads", value: toggleIn(state.roads, v) })} />
        </div>
      )}
    </Section>
  );
}
