import type { Datasets } from "../lib/data";
import { ACCENT, SEV_COLORS } from "../lib/data";
import EChart from "./EChart";
import { Badge, Card } from "./ui";
import type * as echarts from "echarts";

const SEV_NAMES = ["Лёгкие", "Тяжёлые", "С погибшими"];

export default function FleetTab({ data }: { data: Datasets }) {
  const { vehicles, experience } = data;

  const brandsOption: echarts.EChartsOption = {
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const p = (params as { name: string; data: number; marker: string }[])[0];
        const brand = vehicles.top_brands.find((b) => b.name === p.name);
        return `${p.marker} ${p.name}<br/>ДТП с участием: ${p.data}<br/>Доля тяжёлых: ${((brand?.severe_share ?? 0) * 100).toFixed(0)}%`;
      },
    },
    grid: { left: 130, right: 60, top: 8, bottom: 24 },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      data: vehicles.top_brands.map((b) => b.name).reverse(),
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: "bar",
      data: vehicles.top_brands.map((b) => b.count).reverse(),
      itemStyle: { color: ACCENT, borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: "right", color: "#94a3b8" },
    }],
  };

  const modelsOption: echarts.EChartsOption = {
    tooltip: {},
    grid: { left: 210, right: 60, top: 8, bottom: 24 },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      data: vehicles.top_models
        .map((m) => `${m.model} (${m.brand})`)
        .map((s) => (s.length > 34 ? s.slice(0, 33) + "…" : s))
        .reverse(),
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: "bar",
      data: [...vehicles.top_models].sort((x, y) => x.count - y.count).map((m) => m.count),
      itemStyle: { color: "#fbbf24", borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: "right", color: "#94a3b8" },
    }],
  };

  const ageOption: echarts.EChartsOption = {
    tooltip: {},
    grid: { left: 44, right: 16, top: 24, bottom: 28 },
    xAxis: { type: "category", data: vehicles.age_labels },
    yAxis: { type: "value" },
    series: [{
      name: "Возраст ТС на момент ДТП",
      type: "bar",
      data: vehicles.age_counts,
      itemStyle: { color: "#a78bfa", borderRadius: [6, 6, 0, 0] },
    }],
  };

  const expSevOption: echarts.EChartsOption = {
    tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: { color: "#94a3b8" } },
    grid: { left: 50, right: 20, top: 36, bottom: 40 },
    dataZoom: [{ type: "inside" }],
    xAxis: {
      type: "category",
      data: experience.buckets,
      axisLabel: { interval: 0, fontSize: 10 },
    },
    yAxis: [
      { type: "value", axisLabel: { formatter: "{value}" } },
      { type: "value", name: "% тяжёлых", max: 100 },
    ],
    series: [
      {
        name: "ДТП с водителями этого стажа",
        type: "bar",
        data: experience.stats.map((s) => s.accidents),
        itemStyle: { color: "#38bdf8", borderRadius: [4, 4, 0, 0] },
      },
      {
        name: "Доля тяжёлых исходов",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        data: experience.stats.map((s) => Math.round(s.severe_share * 100)),
        lineStyle: { width: 3, color: "#ef4444" },
        itemStyle: { color: "#ef4444" },
      },
      {
        name: "Средний уровень по региону",
        type: "line",
        yAxisIndex: 1,
        data: experience.buckets.map(() => Math.round(experience.baseline_severe_share * 100)),
        lineStyle: { type: "dashed", color: "#64748b" },
        itemStyle: { color: "#64748b" },
      },
    ],
  };

  const expNightOption: echarts.EChartsOption = {
    tooltip: {},
    grid: { left: 50, right: 20, top: 24, bottom: 40 },
    xAxis: {
      type: "category",
      data: experience.buckets,
      axisLabel: { interval: 0, fontSize: 10 },
    },
    yAxis: { type: "value", name: "% ночных ДТП" },
    series: [{
      name: "Доля ночных ДТП",
      type: "bar",
      data: experience.stats.map((s) => Math.round(s.night_share * 100)),
      itemStyle: { color: "#6366f1", borderRadius: [6, 6, 0, 0] },
    }],
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Марки автомобилей в ДТП" subtitle="Топ-25 марок первого ТС · наведи для доли тяжёлых">
          <EChart option={brandsOption} height={420} />
        </Card>
        <Card title="Конкретные модели" subtitle="Топ-30 моделей-участниц ДТП">
          <EChart option={modelsOption} height={420} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Возраст автомобиля" subtitle="Сколько лет было ТС на момент аварии">
          <EChart option={ageOption} height={280} />
        </Card>
        <Card title="Категории ТС" subtitle="Топ-15 типов транспортных средств">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {vehicles.vehicle_categories.slice(0, 12).map(([name, count]) => (
              <Badge key={name} tone="blue">
                {name.length > 38 ? name.slice(0, 37) + "…" : name} · {count.toLocaleString("ru-RU")}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Стаж вождения и тяжесть ДТП"
        subtitle={`У ${(experience.stats.reduce((a, s) => a + s.drivers, 0)).toLocaleString("ru-RU")} водителей из выборки указан стаж`}
      >
        <EChart option={expSevOption} height={320} />
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Столбцы — сколько ДТП произошло с участием водителей каждой группы стажа.
          Красная линия — доля тяжёлых последствий в этих ДТП; серый пунктир — средний уровень по региону.
          Помни: стаж коррелирует с километражем — опытные водители просто больше ездят.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Ночные поездки по группам стажа" subtitle="Доля ДТП, произошедших ночью (23:00–06:00)">
          <EChart option={expNightOption} height={260} />
        </Card>
        <Card title="Что это значит">
          <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-slate-300">
            <li>Молодой стаж — больше «городских» лёгких ДТП: нехватка опыта маневрирования.</li>
            <li>Чем меньше стаж, тем выше доля ночных аварий — новички хуже оценивают скорость в темноте.</li>
            <li>У ветеранов (21+) выше доля тяжёлых исходов — чаще загородные трассы и высокая скорость.</li>
          </ul>
          <div className="mt-3 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex items-center gap-1 text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ background: SEV_COLORS[i] }} />
                {SEV_NAMES[i]}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
