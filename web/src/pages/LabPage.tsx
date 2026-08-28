import { useMemo, useState } from "react";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";
import { useLab, type LabBlock, type LabBlockType, type LabSize } from "../state/LabContext";
import ResearchFilterBar from "../components/ResearchFilterBar";
import ResearchSheet from "../components/ResearchSheet";
import ResearchFindings from "../components/ResearchFindings";
import MapTab from "../components/MapTab";
import EChart from "../components/EChart";
import { deriveRegion } from "../lib/derive";
import { Card } from "../components/ui";
import type * as echarts from "echarts";

/**
 * «Лаборатория» (редизайн по видению): пустой старт «Что добавить в исследование?»,
 * конструктор из заранее спроектированных модулей (не Tableau). Все блоки питаются
 * единым ResearchProvider — меняешь фильтр, вся лаборатория перестраивается.
 * Desktop: перестановка + 3 размера (S KPI, M график, L карта). Mobile: одна колонка.
 * Меню блока: Настроить · Переместить · Дублировать · Удалить.
 */

const BLOCK_META: Record<LabBlockType, { label: string; emoji: string; hint: string; tooltip: string; defaultSize: LabSize }> = {
  map: { label: "Карта", emoji: "🗺️", hint: "карта происшествий среза", tooltip: "Карта ДТП с кластеризацией: количество и тяжесть происшествий в этом срезе исследования. Точки можно приближать.", defaultSize: "L" },
  years: { label: "Динамика по годам", emoji: "📆", hint: "поток ДТП по годам", tooltip: "Столбики ДТП по годам: видно, как меняется число происшествий в срезе за период.", defaultSize: "M" },
  severity: { label: "Тяжесть ДТП", emoji: "📊", hint: "лёгкие / тяжёлые / с погибшими", tooltip: "Круговая диаграмма: доля лёгких, тяжёлых и смертельных ДТП в срезе.", defaultSize: "M" },
  brands: { label: "Марки", emoji: "🚗", hint: "топ марок по ДТП", tooltip: "Марки автомобилей, которые чаще всего встречаются в ДТП этого среза.", defaultSize: "M" },
  tod: { label: "Время суток", emoji: "🕐", hint: "профиль по часам", tooltip: "Распределение ДТП по часам: видно, когда аварийность в срезе самая высокая.", defaultSize: "M" },
  weather: { label: "Погода", emoji: "🌤️", hint: "доля по погодным условиям", tooltip: "Количество ДТП при разных погодных условиях: ясно, дождь, снег, туман.", defaultSize: "M" },
  category: { label: "Типы ДТП", emoji: "🚦", hint: "столкновения, наезды...", tooltip: "Виды происшествий: столкновения, наезды на пешеходов, опрокидывания и другие.", defaultSize: "M" },
  participants: { label: "Участники", emoji: "👤", hint: "водители, пешеходы, мото", tooltip: "Кто участвует в ДТП среза: водители, пассажиры, пешеходы, мотоциклисты.", defaultSize: "M" },
  infra: { label: "Инфраструктура", emoji: "🛣️", hint: "переходы, перекрёстки", tooltip: "Объекты рядом с местами ДТП: переходы, перекрёстки, остановки, мосты.", defaultSize: "M" },
  findings: { label: "Выводы", emoji: "🔍", hint: "что выделяется в срезе", tooltip: "Автоматические находки: что статистически выделяется в этом срезе исследования.", defaultSize: "S" },
};

interface Preset {
  id: string;
  title: string;
  desc: string;
  tip: string;
  emoji: string;
  /** набор блоков: [тип, размер] */
  blocks: [LabBlockType, LabSize][];
}

const PRESETS: Preset[] = [
  {
    id: "safety",
    title: "Безопасность",
    desc: "тяжесть, время, выводы",
    emoji: "🛡️",
    tip: "Тяжесть, время суток и автоматические выводы: что выделяется по исходам в срезе.",
    blocks: [["severity", "M"], ["tod", "M"], ["findings", "S"]],
  },
  {
    id: "overview",
    title: "Обзор аварийности",
    desc: "динамика, типы, погода",
    emoji: "📈",
    tip: "Динамика по годам, типы ДТП и погода: как меняется и что влияет на срез.",
    blocks: [["years", "M"], ["category", "M"], ["weather", "M"]],
  },
  {
    id: "geo",
    title: "Карта + марки",
    desc: "где и кто",
    emoji: "🗺️",
    tip: "Карта происшествий и топ марок в срезе: видно где и чьи автомобили.",
    blocks: [["map", "L"], ["brands", "M"], ["findings", "M"]],
  },
  {
    id: "full",
    title: "Полный разбор",
    desc: "все ключевые слои",
    emoji: "🔬",
    tip: "Карта, динамика, тяжесть, время и выводы — полная картина среза.",
    blocks: [["map", "L"], ["years", "M"], ["severity", "M"], ["tod", "M"], ["findings", "M"]],
  },
];

/**
 * Подсчёт строк среза по semantic-битмаске.
 * Возвращает массив [имя, количество] для тех бит, которые есть в словаре.
 */
function maskCounts(rows: number[][], col: number, dict: string[]): [string, number][] {
  const counts = new Array(dict.length).fill(0);
  for (const r of rows) {
    const mask = r[col] ?? 0;
    if (!mask) continue;
    for (let b = 0; b < dict.length; b++) {
      if (mask & (1 << b)) counts[b]++;
    }
  }
  return dict
    .map((name, i) => [name, counts[i]] as [string, number])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
}

const SIZE_CLASS: Record<LabSize, string> = {
  L: "md:col-span-12",
  M: "md:col-span-6",
  S: "md:col-span-3",
};

function sizeSpan(size: LabSize): string {
  return SIZE_CLASS[size];
}

function useSlice() {
  const app = useApp();
  const { filteredRows } = useResearch();
  return useMemo(() => {
    // «Вся Россия» — полноценный scope: национальные агрегаты (не пустота).
    if (app.scope === "ALL") {
      const n = app.national;
      return {
        slice: null,
        d: {
          total: app.meta.total_accidents,
          dead: app.meta.totals.dead,
          injured: app.meta.totals.injured,
          dateMin: app.meta.date_min,
          dateMax: app.meta.date_max,
          overview: n.overview,
          temporal: n.temporal,
        },
        regionScope: false,
      };
    }
    if (!app.regionFile) return null;
    const slice = filteredRows(app.regionFile.rows);
    const d = deriveRegion(slice, app.dicts);
    return { slice, d, regionScope: true };
  }, [app, filteredRows]);
}

function BlockBody({ block }: { block: LabBlock }) {
  const app = useApp();
  const { filteredRows } = useResearch();
  const ctx = useSlice();
  const mapRows = useMemo(
    () => (app.scope !== "ALL" && app.regionFile ? filteredRows(app.regionFile.rows) : undefined),
    [app.scope, app.regionFile, filteredRows]
  );

  if (block.type === "map") return <MapTab rows={mapRows} />;
  if (block.type === "findings") return <ResearchFindings />;
  if (!ctx) return <div className="py-8 text-center text-xs text-slate-500">Выбери регион, чтобы увидеть блок</div>;
  const d = ctx.d;

  if (block.type === "years") {
    const option: echarts.EChartsOption = {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: d.overview.by_year.map((y) => String(y.year)), axisLabel: { color: "#94a3b8" } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [{ type: "bar", data: d.overview.by_year.map((y) => y.accidents), itemStyle: { color: "#f97316" } }],
    };
    return <EChart option={option} height={200} />;
  }
  if (block.type === "severity") {
    const names = app.dicts.sevs;
    const option: echarts.EChartsOption = {
      tooltip: { trigger: "item" },
      series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "46%"], label: { show: false },
        data: d.overview.severity_totals.map((v, i) => ({ name: names[i], value: v, itemStyle: { color: ["#38bdf8", "#f59e0b", "#ef4444"][i] } })) }],
    };
    return <EChart option={option} height={200} />;
  }
  if (block.type === "category") {
    const cats = d.overview.categories.slice(0, 8);
    const option: echarts.EChartsOption = {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: cats.map(([c]) => c), axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [{ type: "bar", data: cats.map(([, v]) => v), itemStyle: { color: "#38bdf8" } }],
    };
    return <EChart option={option} height={200} />;
  }
  if (block.type === "tod") {
    const option: echarts.EChartsOption = {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")), axisLabel: { color: "#94a3b8", interval: 3 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [{ type: "bar", data: d.temporal.by_hour, itemStyle: { color: "#f59e0b" } }],
    };
    return <EChart option={option} height={200} />;
  }
  if (block.type === "weather") {
    const ws = d.overview.weathers.slice(0, 6);
    const option: echarts.EChartsOption = {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: ws.map(([w]) => w), axisLabel: { color: "#94a3b8", rotate: 25, fontSize: 9 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [{ type: "bar", data: ws.map(([, v]) => v), itemStyle: { color: "#34d399" } }],
    };
    return <EChart option={option} height={200} />;
  }
  if (block.type === "participants" || block.type === "infra" || block.type === "brands") {
    const slice = ctx.slice;
    if (!slice) return (
      <div className="py-8 text-center text-xs text-slate-500">
        Доступно при выборе региона — агрегаты по всей России показаны выше
      </div>
    );
    if (block.type === "participants") {
      // типы участников из semantic-битмаски PART_TYPES (COL.PART_TYPES = 17)
      const data = maskCounts(slice, 17, app.dicts.part_types);
      if (!data.length) return <div className="py-6 text-center text-xs text-slate-400">Нет данных об участниках в срезе</div>;
      const option: echarts.EChartsOption = {
        tooltip: { trigger: "item" },
        series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "46%"], label: { show: false },
          data: data.slice(0, 8).map(([name, v]) => ({ name, value: v })) }],
      };
      return <EChart option={option} height={200} />;
    }
    if (block.type === "infra") {
      // инфраструктурные фасеты из битмаски INFRA (COL.INFRA = 19)
      const data = maskCounts(slice, 19, app.dicts.infra_facets);
      if (!data.length) return <div className="py-6 text-center text-xs text-slate-400">Нет данных об инфраструктуре в срезе</div>;
      const option: echarts.EChartsOption = {
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: data.slice(0, 8).map(([n]) => n), axisLabel: { color: "#94a3b8", rotate: 25, fontSize: 9 } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
        series: [{ type: "bar", data: data.slice(0, 8).map(([, v]) => v), itemStyle: { color: "#22d3ee" } }],
      };
      return <EChart option={option} height={200} />;
    }
    // brands: первая марка ТС из строки (COL.BRAND = 11) — топ марок среза
    const byBrand = new Map<number, number>();
    for (const r of slice) {
      const b = r[11] ?? -1;
      if (b >= 0) byBrand.set(b, (byBrand.get(b) ?? 0) + 1);
    }
    const top = [...byBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) return <div className="py-6 text-center text-xs text-slate-400">Нет данных о марках в срезе</div>;
    const option: echarts.EChartsOption = {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: top.map(([i]) => app.dicts.brands[i] ?? "—"), axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [{ type: "bar", data: top.map(([, v]) => v), itemStyle: { color: "#f97316" } }],
    };
    return <EChart option={option} height={200} />;
  }
  return null;
}

function BlockView({ block, index, onDragStart, onDrop }: { block: LabBlock; index: number; onDragStart: (i: number) => void; onDrop: (i: number) => void }) {
  const { dispatch } = useLab();
  const meta = BLOCK_META[block.type];
  const [menu, setMenu] = useState(false);
  return (
    <div className={sizeSpan(block.size)} draggable onDragStart={() => onDragStart(index)} onDragOver={(e: React.DragEvent) => e.preventDefault()} onDrop={() => onDrop(index)}>
      <Card className="min-w-0 h-full">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{meta.emoji} {meta.label}</h3>
          <div className="relative flex items-center gap-1">
            <select
              value={block.size}
              onChange={(e) => dispatch({ type: "size", id: block.id, size: e.target.value as LabSize })}
              className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400"
              title="Размер блока"
            >
              <option value="S">S · KPI</option>
              <option value="M">M · график</option>
              <option value="L">L · карта</option>
            </select>
            <button onClick={() => setMenu((v) => !v)} className="rounded px-1 text-xs text-slate-500 hover:text-slate-200">⋯</button>
            {menu && (
              <div className="absolute right-0 top-6 z-20 w-36 rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-xl">
                {[
                  { label: "Настроить", action: () => {} },
                  { label: "Переместить ↑", action: () => dispatch({ type: "move", id: block.id, dir: -1 }) },
                  { label: "Переместить ↓", action: () => dispatch({ type: "move", id: block.id, dir: 1 }) },
                  { label: "Дублировать", action: () => dispatch({ type: "duplicate", id: block.id }) },
                  { label: "Удалить", action: () => dispatch({ type: "remove", id: block.id }), danger: true },
                ].map((m) => (
                  <button key={m.label} onClick={() => { m.action(); setMenu(false); }} className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs ${m.danger ? "text-red-400 hover:bg-red-500/10" : "text-slate-300 hover:bg-slate-800"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <BlockBody block={block} />
      </Card>
    </div>
  );
}

export default function LabPage() {
  const app = useApp();
  const { state, dispatch } = useLab();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const addBlock = (type: LabBlockType) => {
    dispatch({ type: "add", block: { id: `${type}-${Date.now()}`, type, size: BLOCK_META[type].defaultSize } });
  };

  /** Применяет пресет: замещает текущую композицию готовым набором блоков. */
  const applyPreset = (p: Preset) => {
    dispatch({
      type: "set",
      blocks: p.blocks.map(([type, size], i) => ({ id: `${type}-${Date.now()}-${i}`, type, size })),
    });
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "ДТП Аналитика — моё исследование", url: location.href });
      else await navigator.clipboard.writeText(location.href);
    } catch (e) { if ((e as Error)?.name === "AbortError") return; }
  };

  // данные для отчёта: срез всегда есть (national или region)
  const ctx = useSlice();
  const regionName = app.scope === "ALL" ? "Вся Россия" : app.meta.regions.find((r) => r.slug === app.scope)?.name ?? "Вся Россия";
  const period = `${app.meta.date_min?.slice(0, 4) ?? "2015"}–${app.meta.date_max?.slice(0, 4) ?? "2026"}`;
  const reportSlice = {
    region: regionName,
    period,
    total: ctx ? ctx.d.total : app.meta.total_accidents,
    dead: ctx ? ctx.d.dead : app.meta.totals.dead,
    injured: ctx ? ctx.d.injured : app.meta.totals.injured,
    blocks: state.blocks,
  };

  const downloadReport = () => {
    const lines = [
      "ДТП Аналитика — моё исследование",
      `${regionName} · ${period}`,
      `ДТП: ${reportSlice.total.toLocaleString("ru-RU")} · погибли: ${reportSlice.dead.toLocaleString("ru-RU")} · ранены: ${reportSlice.injured.toLocaleString("ru-RU")}`,
      "",
      "Блоки: " + state.blocks.map((b) => `${BLOCK_META[b.type].label} (${b.size})`).join(", "),
      "",
      `Ссылка: ${location.href}`,
      `Источник: открытые данные ГИБДД (dtp-stat.ru) · ${new Date().toLocaleDateString("ru-RU")}`,
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dtp-issledovanie.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Строка состояния — единый срез исследования */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResearchFilterBar onOpen={() => setSheetOpen(true)} />
        <div className="flex items-center gap-2">
          <button onClick={() => dispatch({ type: "reset" })} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200">Очистить</button>
          <button onClick={share} className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600">Поделиться исследованием</button>
          <button
            onClick={() => {
              setReportOpen(true);
              setTimeout(() => document.getElementById("lab-report")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
            }}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-white"
          >
            Создать отчёт
          </button>
        </div>
      </div>

      {/* Готовые пресеты дашбордов */}
      <div className="glass rounded-2xl border border-slate-800/80 p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Готовые сочетания</h2>
          <span className="text-[11px] text-slate-500">один клик — разложит блоки за тебя</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              data-tip={p.tip}
              className="needs-tip rounded-xl border border-slate-800 p-3 text-left transition hover:border-slate-600 hover:bg-slate-800/40"
            >
              <div className="text-sm font-medium text-slate-200">{p.emoji} {p.title}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Пустой экран: что добавить */}
      {state.blocks.length === 0 && (
        <div className="glass rounded-2xl border border-slate-800/80 p-6">
          <h2 className="text-base font-semibold text-white">Что добавить в исследование?</h2>
          <p className="mt-1 text-xs text-slate-500">Выбери блоки — все они питаются одним срезом (фильтры сверху). Меняешь фильтр — вся лаборатория перестраивается.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(BLOCK_META) as LabBlockType[]).map((t) => (
              <button
                key={t}
                onClick={() => addBlock(t)}
                data-tip={BLOCK_META[t].tooltip}
                aria-label={`${BLOCK_META[t].label} — ${BLOCK_META[t].tooltip}`}
                className="needs-tip rounded-xl border border-slate-800 p-3 text-left transition hover:border-slate-600 hover:bg-slate-800/40"
              >
                <div className="text-sm font-medium text-slate-200">{BLOCK_META[t].emoji} {BLOCK_META[t].label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{BLOCK_META[t].hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Блоки */}
      {state.blocks.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {state.blocks.map((b, i) => (
            <BlockView key={b.id} block={b} index={i} onDragStart={(i) => setDragFrom(i)} onDrop={(i) => { if (dragFrom !== null && dragFrom !== i) dispatch({ type: "reorder", from: dragFrom, to: i }); setDragFrom(null); }} />
          ))}
        </div>
      )}

      {/* Отчёт: настоящее содержимое + действия (печать/PDF, скачать текст) */}
      {reportOpen && (
        <div className="glass rounded-2xl border border-slate-800/80 p-5 print:block" id="lab-report">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Моё исследование</h2>
              <p className="mt-1 text-xs text-slate-500">
                {reportSlice.region} · {reportSlice.period} · {reportSlice.blocks.length} блоков · {new Date().toLocaleDateString("ru-RU")}
              </p>
            </div>
            <button
              onClick={() => setReportOpen(false)}
              className="rounded-md px-2 py-1 text-slate-500 transition hover:text-slate-200 no-print"
              aria-label="Закрыть отчёт"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-800/60 p-3"><div className="text-lg font-bold text-white">{reportSlice.total.toLocaleString("ru-RU")}</div><div className="text-[10px] text-slate-500">ДТП в срезе</div></div>
            <div className="rounded-lg bg-slate-800/60 p-3"><div className="text-lg font-bold text-red-400">{reportSlice.dead.toLocaleString("ru-RU")}</div><div className="text-[10px] text-slate-500">погибли</div></div>
            <div className="rounded-lg bg-slate-800/60 p-3"><div className="text-lg font-bold text-orange-400">{reportSlice.injured.toLocaleString("ru-RU")}</div><div className="text-[10px] text-slate-500">ранены</div></div>
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 no-print">Собранные блоки</div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {state.blocks.map((b) => (
                <li key={b.id} className="rounded-full border border-slate-700/70 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300">
                  {BLOCK_META[b.type].emoji} {BLOCK_META[b.type].label} · {b.size}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 no-print">
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-orange-600"
            >
              🖨 Печать / Сохранить PDF
            </button>
            <button
              onClick={downloadReport}
              className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500"
            >
              ⬇ Скачать текст
            </button>
          </div>
        </div>
      )}

      <ResearchSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
