import { useMemo, useState } from "react";
import { useApp } from "../state/AppState";
import { useTheme } from "../state/ThemeContext";
import { SEV_COLORS } from "../lib/data";
import { deriveRegion } from "../lib/derive";
import EChart from "./EChart";
import { Badge, Card } from "./ui";
import type * as echarts from "echarts";
import type { PointRow } from "../lib/types";

const SEV_NAMES = ["Лёгкие", "Тяжёлые", "С погибшими"];

export default function TimeTab({ rows }: { rows?: PointRow[] }) {
  const app = useApp();
  const theme = useTheme();
  const isRu = app.scope === "ALL";

  const temporal = useMemo(() => {
    if (isRu) return app.national.temporal;
    const src = rows ?? app.regionFile?.rows;
    if (!src) return null;
    return deriveRegion(src, app.dicts).temporal;
  }, [isRu, rows, app.national, app.regionFile, app.dicts]);

  const [yearIdx, setYearIdx] = useState<number | null>(null);

  const hourStats = useMemo(() => {
    if (!temporal) return null;
    const total = temporal.by_hour.reduce((a, b) => a + b, 0) || 1;
    const mean = total / 24;
    const sorted = temporal.by_hour.map((c, h) => ({ h, c, lift: c / mean })).sort((a, b) => a.lift - b.lift);
    return { best: sorted.slice(0, 4), worst: sorted.slice(-4).reverse() };
  }, [temporal]);

  const heatmapOption: echarts.EChartsOption | null = useMemo(() => {
    if (!temporal) return null;
    const values: [number, number, number][] = [];
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++) values.push([h, d, temporal.hour_weekday[d][h]]);
    const max = Math.max(...values.map((v) => v[2]));
    return {
      tooltip: {
        formatter: (p: unknown) => {
          const [h, d, v] = (p as { value: number[] }).value;
          return `${temporal.weekdays[d]}, ${String(h).padStart(2, "0")}:00 — ${v} ДТП`;
        },
      },
      grid: { left: 46, right: 12, top: 10, bottom: 60 },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), axisLabel: { color: "#94a3b8" } },
      yAxis: { type: "category", data: temporal.weekdays, axisLabel: { color: "#94a3b8" } },
      visualMap: {
        min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 0,
        inRange: { color: ["#0f1d38", "#1e3a5f", "#c2571b", theme.accentMain] },
        textStyle: { color: "#94a3b8" },
      },
      series: [{ type: "heatmap", data: values, label: { show: false } }],
    };
  }, [temporal]);

  const hourOption: echarts.EChartsOption | null = useMemo(() => {
    if (!temporal) return null;
    const worstSet = new Set(hourStats?.worst.map((x) => x.h));
    const bestSet = new Set(hourStats?.best.map((x) => x.h));
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 20, top: 30, bottom: 28 },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, i) => `${i}`), name: "ч" },
      yAxis: { type: "value" },
      series: [{
        type: "bar",
        data: temporal.by_hour.map((c, h) => ({
          value: c,
          itemStyle: {
            color: worstSet.has(h) ? "#ef4444" : bestSet.has(h) ? "#34d399" : "#fb923c",
            borderRadius: [4, 4, 0, 0],
          },
        })),
      }],
    };
  }, [temporal, hourStats]);

  const yIdx = yearIdx ?? (temporal ? temporal.years.length - 1 : 0);

  const monthOption: echarts.EChartsOption | null = useMemo(() => {
    if (!temporal || !temporal.years.length) return null;
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: "#94a3b8" } },
      grid: { left: 50, right: 20, top: 34, bottom: 28 },
      xAxis: { type: "category", data: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"] },
      yAxis: { type: "value" },
      series: [
        {
          name: `${temporal.years[yIdx]}`, type: "bar",
          data: temporal.month_year[yIdx], itemStyle: { color: "#fdba74", borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "Среднее за период", type: "line", smooth: true,
          data: temporal.by_month.map((m) => Math.round(m / temporal.years.length)),
          lineStyle: { width: 3, color: theme.accentMain }, itemStyle: { color: theme.accentMain },
        },
      ],
    };
  }, [temporal, yIdx]);

  const seasonOption: echarts.EChartsOption | null = useMemo(() => {
    if (!temporal) return null;
    const tot = Object.values(temporal.season_counts).reduce((a, b) => a + b, 0) || 1;
    return {
      tooltip: {},
      polar: {},
      angleAxis: {
        type: "category",
        data: temporal.seasons.map((s) => `${s} ${((temporal.season_counts[s] / tot) * 100).toFixed(0)}%`),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
      },
      radiusAxis: { axisLabel: { color: "#64748b", fontSize: 9 } },
      series: [{
        type: "bar", coordinateSystem: "polar",
        data: temporal.seasons.map((s) => temporal.season_counts[s]),
        itemStyle: { color: "#fb923c" },
      }],
    };
  }, [temporal]);

  const todSevOption: echarts.EChartsOption | null = useMemo(() => {
    if (!temporal) return null;
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { color: "#94a3b8" } },
      grid: { left: 50, right: 20, top: 36, bottom: 28 },
      xAxis: { type: "category", data: temporal.tods },
      yAxis: { type: "value", name: "ДТП" },
      series: SEV_NAMES.map((name, i) => ({
        name, type: "bar", stack: "total",
        emphasis: { focus: "series" }, itemStyle: { color: SEV_COLORS[i] },
        data: temporal.tod_severity.map((row) => row[i]),
      })),
    };
  }, [temporal]);

  if (!temporal || !heatmapOption || !hourOption || !monthOption || !seasonOption || !todSevOption || !hourStats) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Считаем временные профили…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Лучшее время для выезда" subtitle="Наименьшая аварийность (lift к среднему часу)">
          <ul className="space-y-2">
            {hourStats.best.map((x) => (
              <li key={x.h} className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2">
                <span className="font-semibold text-emerald-300">{String(x.h).padStart(2, "0")}:00–{String(x.h + 1).padStart(2, "0")}:00</span>
                <Badge tone="green">×{x.lift.toFixed(2)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Худшие часы" subtitle="Наибольшая аварийность">
          <ul className="space-y-2">
            {hourStats.worst.map((x) => (
              <li key={x.h} className="flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2">
                <span className="font-semibold text-red-300">{String(x.h).padStart(2, "0")}:00–{String(x.h + 1).padStart(2, "0")}:00</span>
                <Badge tone="red">×{x.lift.toFixed(2)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Сезонность" subtitle={`Доли сезонов · всего ${Object.values(temporal.season_counts).reduce((a, b) => a + b, 0).toLocaleString("ru-RU")} ДТП`}>
          <EChart option={seasonOption} height={210} />
        </Card>
      </div>

      <Card title="Тепловая карта недели" subtitle="ДТП по дням недели и часам — утренний и вечерний пики видны мгновенно">
        <EChart option={heatmapOption} height={330} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Профиль суток">
          <EChart option={hourOption} height={300} />
        </Card>
        <Card
          title="Месячная динамика"
          subtitle={
            <span className="mt-1 flex items-center gap-2">
              Год:
              <select
                value={yIdx}
                onChange={(e) => setYearIdx(Number(e.target.value))}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
              >
                {temporal.years.map((y, i) => (<option key={y} value={i}>{y}</option>))}
              </select>
            </span>
          }
        >
          <EChart option={monthOption} height={300} />
        </Card>
      </div>

      <Card title="Время суток и тяжесть последствий" subtitle="Ночью доля тяжёлых исходов заметно выше при меньшем числе ДТП">
        <EChart option={todSevOption} height={300} />
      </Card>
    </div>
  );
}
