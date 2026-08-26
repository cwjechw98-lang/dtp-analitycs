import type { Datasets } from "../lib/data";
import { ACCENT, SEV_COLORS } from "../lib/data";
import EChart from "./EChart";
import { Card, StatCard } from "./ui";
import type * as echarts from "echarts";

const SEV_NAMES = ["Лёгкие", "Тяжёлые", "С погибшими"];

export default function OverviewTab({ data }: { data: Datasets }) {
  const { meta, overview } = data;
  const years = overview.by_year;
  const avgPerDay = (meta.total_accidents / 365.25 / (years.length || 1)).toFixed(1);

  const yearOption: echarts.EChartsOption = {
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 50, right: 20, top: 36, bottom: 28 },
    xAxis: { type: "category", data: years.map((y) => y.year) },
    yAxis: [{ type: "value", name: "ДТП" }, { type: "value", name: "Погибли" }],
    series: [
      {
        name: "ДТП",
        type: "bar",
        data: years.map((y) => y.accidents),
        itemStyle: { color: ACCENT, borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 34,
      },
      {
        name: "Погибло",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        data: years.map((y) => y.dead),
        itemStyle: { color: "#ef4444" },
        lineStyle: { width: 3 },
      },
      {
        name: "Ранено",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        data: years.map((y) => y.injured),
        itemStyle: { color: "#38bdf8" },
        lineStyle: { width: 2, type: "dashed" },
      },
    ],
  };

  const catOption: echarts.EChartsOption = {
    tooltip: {},
    grid: { left: 190, right: 40, top: 10, bottom: 28 },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      data: overview.categories.slice(0, 10).map((c) => c[0]).reverse(),
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: "bar",
      data: overview.categories.slice(0, 10).map((c) => c[1]).reverse(),
      itemStyle: { color: "#fb923c", borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: "right", color: "#94a3b8" },
    }],
  };

  const weatherOption: echarts.EChartsOption = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, textStyle: { color: "#94a3b8", fontSize: 11 } },
    series: [{
      type: "pie",
      radius: ["42%", "68%"],
      center: ["50%", "44%"],
      data: overview.weathers.slice(0, 8).map((w) => ({ name: w[0], value: w[1] })),
      label: { formatter: "{d}%", color: "#94a3b8" },
    }],
  };

  const sevOption: echarts.EChartsOption = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, textStyle: { color: "#94a3b8" } },
    series: [{
      type: "pie",
      radius: ["42%", "68%"],
      center: ["50%", "44%"],
      data: SEV_NAMES.map((name, i) => ({
        name,
        value: overview.severity_totals[i],
        itemStyle: { color: SEV_COLORS[i] },
      })),
      label: { formatter: "{d}%", color: "#94a3b8" },
    }],
  };

  const roadOption: echarts.EChartsOption = {
    tooltip: {},
    grid: { left: 210, right: 60, top: 10, bottom: 28 },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      data: overview.roads.slice(0, 7).map((r) =>
        r[0].length > 32 ? r[0].slice(0, 31) + "…" : r[0],
      ).reverse(),
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: "bar",
      data: overview.roads.slice(0, 7).map((r) => r[1]).reverse(),
      itemStyle: { color: "#818cf8", borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: "right", color: "#94a3b8" },
    }],
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Всего ДТП" value={meta.total_accidents.toLocaleString("ru-RU")} hint={`${meta.date_min} — ${meta.date_max}`} />
        <StatCard label="Погибли" value={meta.totals.dead.toLocaleString("ru-RU")} tone="danger" />
        <StatCard label="Ранены" value={meta.totals.injured.toLocaleString("ru-RU")} tone="warn" />
        <StatCard label="В среднем в день" value={avgPerDay} hint="за весь период" />
        <StatCard
          label="Регион"
          value={meta.region}
          hint={`записей отброшено: ${meta.skipped_records}`}
          tone="good"
        />
      </div>

      <Card title="Динамика по годам" subtitle="Столбцы — число ДТП, линии — погибшие и раненые">
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
