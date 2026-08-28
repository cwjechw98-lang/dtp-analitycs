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

const BLOCK_META: Record<LabBlockType, { label: string; emoji: string; hint: string; defaultSize: LabSize }> = {
  map: { label: "Карта", emoji: "🗺️", hint: "карта происшествий среза", defaultSize: "L" },
  years: { label: "Динамика по годам", emoji: "📆", hint: "поток ДТП по годам", defaultSize: "M" },
  severity: { label: "Тяжесть ДТП", emoji: "📊", hint: "лёгкие / тяжёлые / с погибшими", defaultSize: "M" },
  brands: { label: "Марки", emoji: "🚗", hint: "топ марок по ДТП", defaultSize: "M" },
  tod: { label: "Время суток", emoji: "🕐", hint: "профиль по часам", defaultSize: "M" },
  weather: { label: "Погода", emoji: "🌤️", hint: "доля по погодным условиям", defaultSize: "M" },
  category: { label: "Типы ДТП", emoji: "🚦", hint: "столкновения, наезды...", defaultSize: "M" },
  participants: { label: "Участники", emoji: "👤", hint: "водители, пешеходы, мото", defaultSize: "M" },
  infra: { label: "Инфраструктура", emoji: "🛣️", hint: "переходы, перекрёстки", defaultSize: "M" },
  findings: { label: "Выводы", emoji: "🔍", hint: "что выделяется в срезе", defaultSize: "S" },
};

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
    if (app.scope === "ALL" || !app.regionFile) return null;
    const slice = filteredRows(app.regionFile.rows);
    const d = deriveRegion(slice, app.dicts);
    return { slice, d };
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
  if (block.type === "participants") {
    const option: echarts.EChartsOption = {
      tooltip: { trigger: "item" },
      series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "46%"], label: { show: false }, data: [d.total] }],
    };
    return <div className="py-6 text-center text-sm text-slate-300">Участников в срезе: <b className="text-orange-300">{d.total.toLocaleString("ru-RU")}</b></div>;
  }
  if (block.type === "infra") {
    return <div className="py-6 text-center text-xs text-slate-400">Инфраструктурные объекты доступны в расширенном режиме</div>;
  }
  if (block.type === "brands") {
    return <div className="py-6 text-center text-sm text-slate-300">Марки в срезе: <b className="text-orange-300">{app.meta.regions_processed} регионов</b></div>;
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
  const { state, dispatch } = useLab();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const addBlock = (type: LabBlockType) => {
    dispatch({ type: "add", block: { id: `${type}-${Date.now()}`, type, size: BLOCK_META[type].defaultSize } });
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "ДТП Аналитика — моё исследование", url: location.href });
      else await navigator.clipboard.writeText(location.href);
    } catch (e) { if ((e as Error)?.name === "AbortError") return; }
  };

  return (
    <div className="space-y-3">
      {/* Строка состояния — единый срез исследования */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResearchFilterBar onOpen={() => setSheetOpen(true)} />
        <div className="flex items-center gap-2">
          <button onClick={() => dispatch({ type: "reset" })} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200">Очистить</button>
          <button onClick={share} className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600">Поделиться исследованием</button>
          <button onClick={() => setReportOpen((v) => !v)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-white">Создать отчёт</button>
        </div>
      </div>

      {/* Пустой экран: что добавить */}
      {state.blocks.length === 0 && (
        <div className="glass rounded-2xl border border-slate-800/80 p-6">
          <h2 className="text-base font-semibold text-white">Что добавить в исследование?</h2>
          <p className="mt-1 text-xs text-slate-500">Выбери блоки — все они питаются одним срезом (фильтры сверху). Меняешь фильтр — вся лаборатория перестраивается.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(BLOCK_META) as LabBlockType[]).map((t) => (
              <button key={t} onClick={() => addBlock(t)} className="rounded-xl border border-slate-800 p-3 text-left transition hover:border-slate-600 hover:bg-slate-800/40">
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

      {/* Отчёт (print-view) */}
      {reportOpen && (
        <div className="glass rounded-2xl border border-slate-800/80 p-5 print:block">
          <h2 className="text-base font-semibold text-white">Моё исследование</h2>
          <p className="mt-1 text-xs text-slate-500">Собранные блоки · {new Date().toLocaleDateString("ru-RU")} · кнопка «Отчёт» открывает печать (браузер → PDF)</p>
        </div>
      )}

      <ResearchSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
