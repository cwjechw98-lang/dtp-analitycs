import { useMemo } from "react";
import { useApp } from "../state/AppState";
import { useTheme } from "../state/ThemeContext";
import { SEV_COLORS } from "../lib/data";
import { deriveRegion } from "../lib/derive";
import EChart from "./EChart";
import { Card, StatCard } from "./ui";
import type * as echarts from "echarts";

const SEV_NAMES = ["Лёгкие", "Тяжёлые", "С погибшими"];

export default function OverviewTab() {
  const app = useApp();
  const theme = useTheme();
  const isRu = app.scope === "ALL";

  const view = useMemo(() => {
    if (isRu) {
      const o = app.national.overview;
      return {
        overview: o,
        dead: app.meta.totals.dead,
        injured: app.meta.totals.injured,
        dateMin: app.meta.date_min,
        dateMax: app.meta.date_max,
      };
    }
    if (!app.regionFile) return null;
    const d = deriveRegion(app.regionFile.rows, app.dicts);
    return {
      total: d.total,
      overview: d.overview,
      dead: d.dead,
      injured: d.injured,
      dateMin: d.dateMin,
      dateMax: d.dateMax,
    };
  }, [isRu, app.national, app.meta, app.regionFile, app.dicts]);

  const years = view?.overview.by_year ?? [];
  const avgPerDay =
    view && years.length
      ? (view.overview.by_year.reduce((a, y) => a + y.accidents, 0) / 365.25 / years.length).toFixed(1)
      : "…";

  const yearOption: echarts.EChartsOption | null = useMemo(() => {
    if (!view || !years.length) return null;
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 56, right: 20, top: 36, bottom: 28 },
      xAxis: { type: "category", data: years.map((y) => y.year) },
      yAxis: [{ type: "value", name: "ДТП" }, { type: "value", name: "Погибли" }],
      series: [
        {
          name: "ДТП", type: "bar", barMaxWidth: 34,
          itemStyle: { color: theme.accentMain, borderRadius: [6, 6, 0, 0] },
          data: years.map((y) => y.accidents),
        },
        {
          name: "Погибло", type: "line", yAxisIndex: 1, smooth: true,
          itemStyle: { color: "#ef4444" }, lineStyle: { width: 3 },
          data: years.map((y) => y.dead),
        },
        {
          name: "Ранено", type: "line", yAxisIndex: 1, smooth: true,
          itemStyle: { color: "#38bdf8" }, lineStyle: { width: 2, type: "dashed" },
          data: years.map((y) => y.injured),
        },
      ],
    };
  }, [view, years, theme.accentMain]);

  const catOption: echarts.EChartsOption | null = useMemo(() => {
    if (!view) return null;
    const cats = view.overview.categories.slice(0, 10);
    return {
      tooltip: {},
      grid: { left: 190, right: 46, top: 10, bottom: 28 },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: cats.map((c) => c[0]).reverse(), axisLabel: { fontSize: 11 } },
      series: [{
        type: "bar",
        data: cats.map((c) => c[1]).reverse(),
        itemStyle: { color: "#fb923c", borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: "#94a3b8" },
      }],
    };
  }, [view]);

  const weatherOption: echarts.EChartsOption | null = useMemo(() => {
    if (!view) return null;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { color: "#94a3b8", fontSize: 11 } },
      series: [{
        type: "pie", radius: ["42%", "68%"], center: ["50%", "44%"],
        data: view.overview.weathers.slice(0, 8).map((w) => ({ name: w[0], value: w[1] })),
        label: { formatter: "{d}%", color: "#94a3b8" },
      }],
    };
  }, [view]);

  const sevOption: echarts.EChartsOption | null = useMemo(() => {
    if (!view) return null;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { color: "#94a3b8" } },
      series: [{
        type: "pie", radius: ["42%", "68%"], center: ["50%", "44%"],
        data: SEV_NAMES.map((name, i) => ({
          name, value: view.overview.severity_totals[i],
          itemStyle: { color: SEV_COLORS[i] },
        })),
        label: { formatter: "{d}%", color: "#94a3b8" },
      }],
    };
  }, [view]);

  const roadOption: echarts.EChartsOption | null = useMemo(() => {
    if (!view) return null;
    const roads = view.overview.roads.slice(0, 7);
    return {
      tooltip: {},
      grid: { left: 210, right: 60, top: 10, bottom: 28 },
      xAxis: { type: "value" },
      yAxis: {
        type: "category",
        data: roads.map((r) => (r[0].length > 32 ? r[0].slice(0, 31) + "…" : r[0])).reverse(),
        axisLabel: { fontSize: 11 },
      },
      series: [{
        type: "bar",
        data: roads.map((r) => r[1]).reverse(),
        itemStyle: { color: "#818cf8", borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: "#94a3b8" },
      }],
    };
  }, [view]);

  if (!view || !yearOption || !catOption || !weatherOption || !sevOption || !roadOption) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Считаем статистику региона…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Всего ДТП" value={view.total ?? years.reduce((a, y) => a + y.accidents, 0)} hint={`${view.dateMin ?? ""} — ${view.dateMax ?? ""}`} />
        <StatCard label="Погибли" value={view.dead} tone="danger" />
        <StatCard label="Ранены" value={view.injured} tone="warn" />
        <StatCard label="В среднем в день" value={avgPerDay} hint="за весь период" />
        <StatCard label={isRu ? "Регионов в данных" : "Выбранный регион"} value={isRu ? app.meta.regions_processed : regionNameOf(app)} tone="good" />
      </div>

      <Card title="Динамика по годам" subtitle="Столбцы — ДТП, линии — погибшие и раненые">
        <EChart option={yearOption} height={340} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Категории ДТП" subtitle="Топ-10 типов происшествий">
          <EChart option={catOption} height={360} />
        </Card>
        <div className="space-y-4">
          <Card title="Тяжесть последствий">
            <EChart option={sevOption} height={200} />
          </Card>
          <Card title="Погодные условия">
            <EChart option={weatherOption} height={260} />
          </Card>
        </div>
      </div>

      <Card title="Состояние дорожного покрытия" subtitle="Топ-7 значений">
        <EChart option={roadOption} height={280} />
      </Card>
    </div>
  );
}

function regionNameOf(app: ReturnType<typeof useApp>): string {
  return app.meta.regions.find((r) => r.slug === app.scope)?.name ?? app.scope;
}
