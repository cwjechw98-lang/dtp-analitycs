import { useMemo } from "react";
import { useApp } from "../state/AppState";
import { ACCENT, SEV_COLORS } from "../lib/data";
import { deriveRegion, deriveRegionCulprits } from "../lib/derive";
import EChart from "./EChart";
import { Badge, Card } from "./ui";
import type * as echarts from "echarts";

const SEV_NAMES = ["Лёгкие", "Тяжёлые", "С погибшими"];

export default function FleetTab() {
  const app = useApp();
  const isRu = app.scope === "ALL";

  const vehicles = useMemo(() => {
    if (!isRu && app.regionFile) {
      // для региона считаем марки из строк
      const m = new Map<number, number>();
      for (const r of app.regionFile.rows) if (r[11] >= 0) m.set(r[11], (m.get(r[11]) ?? 0) + 1);
      const top = [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([i, c]) => ({ name: app.dicts.brands[i] ?? "—", count: c }));
      return top;
    }
    return app.national.vehicles.top_brands;
  }, [isRu, app.regionFile, app.dicts.brands, app.national]);

  const culprits = useMemo(() => {
    if (!isRu && app.regionFile) return deriveRegionCulprits(app.regionFile.rows);
    return null;
  }, [isRu, app.regionFile]);

  const nationalCulprits = app.national.culprits;

  const brandsOption: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      grid: { left: 130, right: 60, top: 8, bottom: 24 },
      xAxis: { type: "value" },
      yAxis: {
        type: "category",
        data: vehicles.map((b) => b.name).reverse(),
        axisLabel: { fontSize: 11 },
      },
      series: [{
        type: "bar",
        data: vehicles.map((b) => b.count).reverse(),
        itemStyle: { color: ACCENT, borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: "#94a3b8" },
      }],
    }),
    [vehicles],
  );

  const expSevOption: echarts.EChartsOption | null = useMemo(() => {
    const ex = app.national.experience;
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: "#94a3b8" } },
      grid: { left: 50, right: 24, top: 36, bottom: 40 },
      xAxis: { type: "category", data: ex.buckets, axisLabel: { interval: 0, fontSize: 10 } },
      yAxis: [
        { type: "value" },
        { type: "value", name: "% тяжёлых", max: 100 },
      ],
      series: [
        {
          name: "ДТП с водителями этого стажа", type: "bar",
          data: ex.stats.map((s) => s.accidents),
          itemStyle: { color: "#38bdf8", borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "Доля тяжёлых исходов", type: "line", yAxisIndex: 1, smooth: true,
          data: ex.stats.map((s) => Math.round(s.severe_share * 100)),
          lineStyle: { width: 3, color: "#ef4444" }, itemStyle: { color: "#ef4444" },
        },
        {
          name: "Средний уровень", type: "line", yAxisIndex: 1,
          data: ex.buckets.map(() => Math.round(ex.baseline_severe_share * 100)),
          lineStyle: { type: "dashed", color: "#64748b" }, itemStyle: { color: "#64748b" },
        },
      ],
    };
  }, [app.national.experience]);

  const expNightOption: echarts.EChartsOption | null = useMemo(() => {
    const ex = app.national.experience;
    return {
      tooltip: {},
      grid: { left: 50, right: 20, top: 24, bottom: 40 },
      xAxis: { type: "category", data: ex.buckets, axisLabel: { interval: 0, fontSize: 10 } },
      yAxis: { type: "value", name: "% ночных ДТП" },
      series: [{
        name: "Доля ночных ДТП", type: "bar",
        data: ex.stats.map((s) => Math.round(s.night_share * 100)),
        itemStyle: { color: "#6366f1", borderRadius: [6, 6, 0, 0] },
      }],
    };
  }, [app.national.experience]);

  // Виновность по маркам: нац. матрица + региональный рейтинг
  const culpritBars = useMemo(() => {
    if (culprits) {
      return culprits.byBrand.slice(0, 15).map((b) => ({
        brand: app.dicts.brands[b.idx] ?? "?",
        culprit: b.count,
        victim: null as number | null,
        aggr: null as number | null,
      }));
    }
    return nationalCulprits.brands.slice(0, 15).map((b) => ({
      brand: b.brand, culprit: b.culprit, victim: b.victim, aggr: b.aggr,
    }));
  }, [culprits, nationalCulprits, app.dicts.brands]);

  const culpritOption: echarts.EChartsOption | null = useMemo(() => {
    if (!culpritBars.length) return null;
    const hasVictim = culpritBars.some((b) => b.victim !== null);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { color: "#94a3b8" } },
      grid: { left: 130, right: 30, top: hasVictim ? 34 : 16, bottom: 24 },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: culpritBars.map((b) => b.brand).reverse(), axisLabel: { fontSize: 11 } },
      series: [
        {
          name: "Виновник (ТС с нарушениями)", type: "bar", stack: isRu ? undefined : undefined,
          barGap: "-100%",
          data: culpritBars.map((b) => b.culprit).reverse(),
          itemStyle: { color: "#ef4444", borderRadius: [0, 5, 5, 0], opacity: 0.92 },
        },
        ...(hasVictim
          ? [{
              name: "Пострадавший (без нарушений)", type: "bar" as const,
              data: [...culpritBars].reverse().map((b) => b.victim ?? 0),
              itemStyle: { color: "#38bdf8", borderRadius: [0, 5, 5, 0], opacity: 0.85 },
            }]
          : []),
      ],
    };
  }, [culpritBars, isRu]);

  const violationsTop = nationalCulprits.violations_top;

  return (
    <div className="space-y-4">
      {/* --- Виновники --- */}
      <Card
        title="⚠️ Кто виновник: марки-лидеры"
        subtitle={nationalCulprits.methodology}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge tone="red">виновник: у водителя есть нарушение ПДД</Badge>
          <Badge tone="blue">пострадавший: нарушений нет</Badge>
          <Badge tone="slate">
            ДТП с установленным виновником за рулём:{" "}
            {nationalCulprits.totals.with_vehicle_culprit.toLocaleString("ru-RU")} из{" "}
            {nationalCulprits.totals.accidents.toLocaleString("ru-RU")}
          </Badge>
        </div>
        {culpritOption ? (
          <EChart option={culpritOption} height={430} />
        ) : (
          <p className="text-sm text-slate-500">Нет данных по региону.</p>
        )}
        {!isRu && (
          <p className="mt-2 text-xs text-slate-500">
            Показан рейтинг марок-виновников выбранного региона. Сравнение «виновник/жертва» — на вкладке в режиме «Вся Россия».
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Топ нарушений виновников" subtitle="По всем участникам-водителям страны">
          <ol className="space-y-1.5 text-xs">
            {violationsTop.slice(0, 12).map(([t, c], i) => (
              <li key={t} className="flex items-center gap-2 rounded-lg bg-slate-800/40 px-2.5 py-1.5">
                <span className="w-5 text-right font-bold text-orange-400">{i + 1}</span>
                <span className="flex-1 leading-snug text-slate-300">{t}</span>
                <span className="tabular-nums text-slate-400">{c.toLocaleString("ru-RU")}</span>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-4">
          <Card title="Марки автомобилей в ДТП" subtitle={isRu ? "Топ-25 марок первого ТС" : "Топ марок региона"}>
            <EChart option={brandsOption} height={420} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Стаж вождения и тяжесть ДТП" subtitle="Национальные данные · ~93% водителей имеют стаж в записях">
          <EChart option={expSevOption!} height={320} />
        </Card>
        <Card title="Ночные поездки по группам стажа" subtitle="Доля ДТП ночью (23:00–06:00)">
          <EChart option={expNightOption!} height={260} />
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
