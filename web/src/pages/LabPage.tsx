import { useMemo } from "react";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";
import { useLab, type LabBlock, type LabBlockType } from "../state/LabContext";
import ResearchFilters from "../components/ResearchFilters";
import ResearchFindings from "../components/ResearchFindings";
import MapTab from "../components/MapTab";
import EChart from "../components/EChart";
import { deriveRegion } from "../lib/derive";
import { Section, Card } from "../components/ui";
import type * as echarts from "echarts";

/**
 * «Лаборатория» (v1): пользователь собирает блоки в свою раскладку.
 * Все блоки читают единый ResearchProvider — фильтры применяются автоматически.
 * Раскладка сохраняется в ?lab= и делится ссылкой.
 */

const BLOCK_META: Record<LabBlockType, { label: string; emoji: string }> = {
  map: { label: "Карта", emoji: "🗺️" },
  severity: { label: "Тяжесть", emoji: "📊" },
  time: { label: "Время суток", emoji: "🕐" },
  findings: { label: "Находки", emoji: "🔍" },
  stats: { label: "Статистика", emoji: "📈" },
  category: { label: "Категории ДТП", emoji: "🚗" },
};

function MiniChart({ title, kind }: { title: string; kind: "severity" | "time" | "category" }) {
  const app = useApp();
  const { filteredRows } = useResearch();
  const option = useMemo<echarts.EChartsOption | null>(() => {
    if (app.scope === "ALL" || !app.regionFile) return null;
    const slice = filteredRows(app.regionFile.rows);
    const d = deriveRegion(slice, app.dicts);
    if (!d) return null;
    if (kind === "severity") {
      const names = app.dicts.sevs;
      return {
        tooltip: { trigger: "item" },
        series: [{
          type: "pie", radius: ["40%", "68%"], center: ["50%", "46%"],
          label: { show: false },
          data: d.overview.severity_totals.map((v, i) => ({ name: names[i], value: v, itemStyle: { color: ["#38bdf8", "#f59e0b", "#ef4444"][i] } })),
        }],
      };
    }
    if (kind === "time") {
      return {
        tooltip: { trigger: "axis" },
        toolbox: { show: false },
        xAxis: { type: "category", data: ["00", "06", "12", "18", "23"], axisLabel: { color: "#94a3b8" } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
        series: [{ type: "bar", data: [d.temporal.by_hour[0], d.temporal.by_hour[6], d.temporal.by_hour[12], d.temporal.by_hour[18], d.temporal.by_hour[23]], itemStyle: { color: "#f59e0b" } }],
      };
    }
    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: d.overview.categories.slice(0, 8).map(([c]) => c), axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [{ type: "bar", data: d.overview.categories.slice(0, 8).map(([, v]) => v), itemStyle: { color: "#38bdf8" } }],
    };
  }, [app, filteredRows, kind]);
  if (!option) return <div className="py-8 text-center text-xs text-slate-500">Выбери регион, чтобы увидеть график</div>;
  return <EChart option={option} height={220} />;
}

function BlockView({ block }: { block: LabBlock }) {
  const { dispatch } = useLab();
  const app = useApp();
  const { filteredRows } = useResearch();
  const meta = BLOCK_META[block.type];
  const mapRows = useMemo(
    () => (app.scope !== "ALL" && app.regionFile ? filteredRows(app.regionFile.rows) : undefined),
    [app.scope, app.regionFile, filteredRows]
  );
  return (
    <Card className={`min-w-0 ${block.span === 12 ? "col-span-12" : block.span === 6 ? "sm:col-span-6" : "sm:col-span-3"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{meta.emoji} {meta.label}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => dispatch({ type: "move", id: block.id, dir: -1 })} className="rounded px-1 text-xs text-slate-500 hover:text-slate-200" title="Вверх">↑</button>
          <button onClick={() => dispatch({ type: "move", id: block.id, dir: 1 })} className="rounded px-1 text-xs text-slate-500 hover:text-slate-200" title="Вниз">↓</button>
          <select
            value={block.span}
            onChange={(e) => dispatch({ type: "span", id: block.id, span: Number(e.target.value) as LabBlock["span"] })}
            className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400"
          >
            <option value={12}>широкий</option>
            <option value={6}>половина</option>
            <option value={3}>треть</option>
          </select>
          <button onClick={() => dispatch({ type: "remove", id: block.id })} className="rounded px-1 text-xs text-slate-500 hover:text-red-400" title="Удалить">✕</button>
        </div>
      </div>
      {block.type === "map" && <MapTab rows={mapRows} />}
      {block.type === "findings" && <ResearchFindings />}
      {block.type === "severity" && <MiniChart title="Тяжесть" kind="severity" />}
      {block.type === "time" && <MiniChart title="Время суток" kind="time" />}
      {block.type === "category" && <MiniChart title="Категории ДТП" kind="category" />}
      {block.type === "stats" && <StatsBlock />}
    </Card>
  );
}

function StatsBlock() {
  const app = useApp();
  const { filteredRows } = useResearch();
  const stats = useMemo(() => {
    if (app.scope === "ALL" || !app.regionFile) return null;
    const slice = filteredRows(app.regionFile.rows);
    const d = deriveRegion(slice, app.dicts);
    return d ? { total: d.total, dead: d.dead, injured: d.injured } : null;
  }, [app, filteredRows]);
  if (!stats) return <div className="py-8 text-center text-xs text-slate-500">Выбери регион</div>;
  return (
    <div className="flex gap-3 text-sm">
      <div className="flex-1 rounded-lg bg-slate-800/60 p-3"><div className="text-lg font-bold text-white">{stats.total.toLocaleString("ru-RU")}</div><div className="text-[10px] text-slate-500">ДТП</div></div>
      <div className="flex-1 rounded-lg bg-slate-800/60 p-3"><div className="text-lg font-bold text-red-400">{stats.dead.toLocaleString("ru-RU")}</div><div className="text-[10px] text-slate-500">Погибшие</div></div>
      <div className="flex-1 rounded-lg bg-slate-800/60 p-3"><div className="text-lg font-bold text-orange-400">{stats.injured.toLocaleString("ru-RU")}</div><div className="text-[10px] text-slate-500">Раненые</div></div>
    </div>
  );
}

export default function LabPage() {
  const { state, dispatch } = useLab();
  const addBlock = (type: LabBlockType) => {
    dispatch({ type: "add", block: { id: `${type}-${Date.now()}`, type, span: 6 } });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="hidden md:block">
          <div className="sticky top-[104px]"><ResearchFilters /></div>
        </div>
        <div className="space-y-3">
          <Section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Лаборатория</h2>
                <p className="text-xs text-slate-500">Собери свою раскладку из блоков. Фильтры слева применяются ко всем блокам. Ссылка сохранит и раскладку, и фильтры.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => dispatch({ type: "reset" })} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200">Сбросить</button>
                <button
                  onClick={() => { navigator.clipboard.writeText(location.href).catch(() => {}); }}
                  className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600"
                >
                  Поделиться
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(Object.keys(BLOCK_META) as LabBlockType[]).map((t) => (
                <button key={t} onClick={() => addBlock(t)} className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:text-white">
                  + {BLOCK_META[t].emoji} {BLOCK_META[t].label}
                </button>
              ))}
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            {state.blocks.map((b) => <BlockView key={b.id} block={b} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
