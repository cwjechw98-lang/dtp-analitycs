import { useEffect, useMemo, useRef, useState } from "react";
import type { Datasets } from "../lib/data";
import { ACCENT, SEV_COLORS } from "../lib/data";
import EChart from "./EChart";
import { Badge, Card } from "./ui";
import { filterCorridor } from "../lib/corridor";
import { fetchRoute, geocode, type GeoResult, type OsrmRoute } from "../lib/osrm";
import type * as echarts from "echarts";

interface Pt {
  lat: number;
  lon: number;
  label: string;
}

const PRESETS: { name: string; a: Pt; b: Pt }[] = [
  {
    name: "Омск (центр) → Исилькуль, трасса на Тюмень",
    a: { lat: 54.9885, lon: 73.3242, label: "Омск, центр" },
    b: { lat: 54.9136, lon: 71.2685, label: "Исилькуль" },
  },
  {
    name: "Омск (центр) → Калачинск",
    a: { lat: 54.9885, lon: 73.3242, label: "Омск, центр" },
    b: { lat: 55.0483, lon: 74.5673, label: "Калачинск" },
  },
  {
    name: "Омск (центр) → Азово",
    a: { lat: 54.9885, lon: 73.3242, label: "Омск, центр" },
    b: { lat: 54.9969, lon: 72.7844, label: "Азово" },
  },
  {
    name: "Омск (центр) → Тара",
    a: { lat: 54.9885, lon: 73.3242, label: "Омск, центр" },
    b: { lat: 56.9007, lon: 74.3692, label: "Тара" },
  },
];

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const SEASONS = ["Зима", "Весна", "Лето", "Осень"];

function monthToSeason(m: number): number {
  return m === 12 || m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3;
}

export default function RouteTab({ data }: { data: Datasets }) {
  const [a, setA] = useState<Pt | null>(null);
  const [b, setB] = useState<Pt | null>(null);
  const [route, setRoute] = useState<OsrmRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<"A" | "B" | null>(null);
  const [queryA, setQueryA] = useState("");
  const [queryB, setQueryB] = useState("");
  const [results, setResults] = useState<{ for: "A" | "B"; items: GeoResult[] } | null>(null);
  const [expBucket, setExpBucket] = useState(3);
  const [bufferM, setBufferM] = useState(400);

  // ---- мини-карта ----
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layersRef = useRef<any>(null);
  const pickRef = useRef<"A" | "B" | null>(null);

  useEffect(() => {
    pickRef.current = pickMode;
  }, [pickMode]);

  useEffect(() => {
    const node = mapEl.current;
    if (!node || mapRef.current) return;
    let destroyed = false;
    (async () => {
      const L = await import("leaflet");
      if (destroyed) return;
      const map = L.map(node, { preferCanvas: true }).setView([54.99, 73.37], 10);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);
      const group = L.layerGroup().addTo(map);
      map.on("click", (e: L.LeafletMouseEvent) => {
        const mode = pickRef.current;
        if (!mode) return;
        setResults(null);
        const pt = { lat: e.latlng.lat, lon: e.latlng.lng, label: `Точка (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})` };
        if (mode === "A") { setA(pt); setPickMode("B"); }
        else { setB(pt); setPickMode(null); }
      });
      mapRef.current = map;
      layersRef.current = group;
    })();
    return () => {
      destroyed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // перерисовка слоёв мини-карты
  useEffect(() => {
    (async () => {
      const group = layersRef.current;
      if (!group) return;
      const L = await import("leaflet");
      group.clearLayers();
      if (a)
        L.circleMarker([a.lat, a.lon], { radius: 8, color: "#38bdf8", fillOpacity: 1, fillColor: "#38bdf8" })
          .bindTooltip("A: " + a.label).addTo(group);
      if (b)
        L.circleMarker([b.lat, b.lon], { radius: 8, color: "#ef4444", fillOpacity: 1, fillColor: "#ef4444" })
          .bindTooltip("Б: " + b.label).addTo(group);
      if (route) {
        L.polyline(route.geometry, { color: "#f97316", weight: 5, opacity: 0.85 }).addTo(group);
        mapRef.current?.fitBounds(L.polyline(route.geometry).getBounds(), { padding: [24, 24] });
      }
    })();
  }, [a, b, route]);

  async function loadRoute(pa: Pt, pb: Pt) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchRoute([pa.lat, pa.lon], [pb.lat, pb.lon]);
      setRoute(r);
    } catch (e) {
      setRoute(null);
      setError(
        e instanceof Error
          ? `${e.message}. Публичные гео-сервисы иногда недоступны — попробуй ещё раз или укажи точки кликом по карте.`
          : String(e),
      );
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(idx: number) {
    const p = PRESETS[idx];
    setA(p.a);
    setB(p.b);
    void loadRoute(p.a, p.b);
  }

  async function doGeocode(which: "A" | "B") {
    const q = which === "A" ? queryA : queryB;
    if (q.trim().length < 3) return;
    try {
      const items = await geocode(q);
      setResults({ for: which, items });
    } catch {
      setError("Геокодинг недоступен, укажи точку кликом по карте.");
    }
  }

  function chooseResult(r: GeoResult, which: "A" | "B") {
    const pt = { lat: r.lat, lon: r.lon, label: r.name.split(",").slice(0, 3).join(",") };
    setResults(null);
    if (which === "A") setA(pt);
    else setB(pt);
  }

  // ---- статистика коридора ----
  const corridor = useMemo(() => {
    if (!route) return null;
    const rows = filterCorridor(data.points.rows, route.geometry, bufferM);
    const byHour = Array(24).fill(0);
    const byMonth = Array(12).fill(0);
    const seasonCnt = Array(4).fill(0);
    const weathers: Record<string, number> = {};
    const cats: Record<string, number> = {};
    const brands: Record<string, number> = {};
    let dead = 0, injured = 0, severe = 0;
    const d = data.points.dicts;
    for (const r of rows) {
      byHour[r[4]]++;
      byMonth[(r[2] % 100) - 1]++;
      seasonCnt[monthToSeason(r[2] % 100)]++;
      if (r[8] >= 0) weathers[d.weathers[r[8]]] = (weathers[d.weathers[r[8]]] ?? 0) + 1;
      cats[d.cats[r[6]]] = (cats[d.cats[r[6]]] ?? 0) + 1;
      if (r[11] >= 0) brands[d.brands[r[11]]] = (brands[d.brands[r[11]]] ?? 0) + 1;
      dead += r[12];
      injured += r[13];
      if (r[5] >= 1) severe++;
    }
    const total = rows.length;
    const mean = total / 24 || 1;
    const hoursSorted = byHour.map((c, h) => ({ h, c, lift: c / mean })).sort((x, y) => x.lift - y.lift);
    return {
      rows, total, dead, injured,
      severeShare: total ? severe / total : 0,
      bestHours: hoursSorted.slice(0, 3),
      worstHours: hoursSorted.slice(-3).reverse(),
      byHour, byMonth, seasonCnt,
      topWeathers: Object.entries(weathers).sort((x, y) => y[1] - x[1]).slice(0, 5),
      topCats: Object.entries(cats).sort((x, y) => y[1] - x[1]).slice(0, 8),
      topBrands: Object.entries(brands).sort((x, y) => y[1] - x[1]).slice(0, 10),
    };
  }, [route, bufferM, data]);

  // ---- советы для маршрута ----
  const routeTips = useMemo(() => {
    if (!corridor) return [];
    const tips = [...data.tips.rules];
    const score = (t: typeof tips[number]) => {
      let s = 0;
      if (t.scope === "experience" && t.when.experience_bucket === data.experience.buckets[expBucket]) s += 3;
      if (t.scope === "weather" && corridor.topWeathers.some(([w]) => w === t.when.weather)) s += 2.5;
      if (t.scope === "season_time" && corridor.seasonCnt.length) s += 0.5;
      if (t.scope === "time") s += 0.5;
      return s * t.lift;
    };
    return tips
      .map((t) => ({ t, s: score(t) }))
      .filter(({ t }) => {
        if (t.scope === "experience") return t.when.experience_bucket === data.experience.buckets[expBucket];
        if (t.scope === "weather")
          return corridor.topWeathers.some(([w]) => w === t.when.weather);
        return true;
      })
      .sort((x, y) => y.s - x.s)
      .slice(0, 6)
      .map(({ t }) => t);
  }, [corridor, data.tips.rules, expBucket, data.experience.buckets]);

  const hourChartOption: echarts.EChartsOption | null = useMemo(() => {
    if (!corridor) return null;
    const bestSet = new Set(corridor.bestHours.map((x) => x.h));
    const worstSet = new Set(corridor.worstHours.map((x) => x.h));
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 44, right: 16, top: 28, bottom: 28 },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, i) => `${i}`), name: "ч" },
      yAxis: { type: "value" },
      series: [{
        type: "bar",
        data: corridor.byHour.map((c, h) => ({
          value: c,
          itemStyle: {
            color: worstSet.has(h) ? "#ef4444" : bestSet.has(h) ? "#34d399" : "#fb923c",
            borderRadius: [4, 4, 0, 0],
          },
        })),
      }],
    };
  }, [corridor]);

  const monthChartOption: echarts.EChartsOption | null = useMemo(() => {
    if (!corridor) return null;
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 44, right: 16, top: 20, bottom: 28 },
      xAxis: { type: "category", data: MONTHS },
      yAxis: { type: "value" },
      series: [{
        type: "bar",
        data: corridor.byMonth,
        itemStyle: { color: "#818cf8", borderRadius: [4, 4, 0, 0] },
      }],
    };
  }, [corridor]);

  const seasonPieOption: echarts.EChartsOption | null = useMemo(() => {
    if (!corridor) return null;
    const palette = ["#60a5fa", "#34d399", "#fbbf24", "#fb923c"];
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { color: "#94a3b8" } },
      series: [{
        type: "pie",
        radius: ["40%", "66%"],
        center: ["50%", "45%"],
        data: SEASONS.map((s, i) => ({ name: s, value: corridor.seasonCnt[i], itemStyle: { color: palette[i] } })),
        label: { formatter: "{d}%", color: "#94a3b8" },
      }],
    };
  }, [corridor]);

  const catChartOption: echarts.EChartsOption | null = useMemo(() => {
    if (!corridor) return null;
    return {
      tooltip: {},
      grid: { left: 170, right: 46, top: 8, bottom: 24 },
      xAxis: { type: "value" },
      yAxis: {
        type: "category",
        data: corridor.topCats.map((c) => c[0]).reverse(),
        axisLabel: { fontSize: 11 },
      },
      series: [{
        type: "bar",
        data: corridor.topCats.map((c) => c[1]).reverse(),
        itemStyle: { color: SEV_COLORS[1], borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: "#94a3b8" },
      }],
    };
  }, [corridor]);

  const brandChartOption: echarts.EChartsOption | null = useMemo(() => {
    if (!corridor) return null;
    return {
      tooltip: {},
      grid: { left: 150, right: 46, top: 8, bottom: 24 },
      xAxis: { type: "value" },
      yAxis: {
        type: "category",
        data: corridor.topBrands.map((c) => c[0]).reverse(),
        axisLabel: { fontSize: 11 },
      },
      series: [{
        type: "bar",
        data: corridor.topBrands.map((c) => c[1]).reverse(),
        itemStyle: { color: ACCENT, borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: "#94a3b8" },
      }],
    };
  }, [corridor]);

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-orange-500 outline-none";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Панель выбора маршрута */}
        <Card title="Маршрут А → Б" subtitle="Пресеты, поиск адреса или клик по карте">
          <div className="space-y-3">
            <select
              className={inputCls}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value !== "") applyPreset(Number(e.target.value));
              }}
            >
              <option value="" disabled>
                Готовые маршруты…
              </option>
              {PRESETS.map((p, i) => (
                <option key={p.name} value={i}>{p.name}</option>
              ))}
            </select>

            {(["A", "B"] as const).map((which) => (
              <div key={which}>
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    placeholder={which === "A" ? "Точка А: адрес…" : "Точка Б: адрес…"}
                    value={which === "A" ? queryA : queryB}
                    onChange={(e) => (which === "A" ? setQueryA : setQueryB)(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void doGeocode(which)}
                  />
                  <button
                    onClick={() => void doGeocode(which)}
                    className="rounded-lg bg-slate-700 px-3 text-sm hover:bg-slate-600"
                  >
                    🔍
                  </button>
                </div>
                {results?.for === which && (
                  <ul className="mt-1 space-y-1 rounded-lg border border-slate-700 bg-slate-800 p-1 text-xs">
                    {results.items.length === 0 && <li className="px-2 py-1 text-slate-400">Ничего не найдено</li>}
                    {results.items.map((r, i) => (
                      <li key={i}>
                        <button
                          className="w-full rounded px-2 py-1 text-left hover:bg-slate-700"
                          onClick={() => chooseResult(r, which)}
                        >
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            <div className="flex gap-2">
              <button
                onClick={() => setPickMode(pickMode === "A" ? null : "A")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  pickMode === "A" ? "bg-sky-500 text-white" : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                📍 A {a ? "✓" : ""}
              </button>
              <button
                onClick={() => setPickMode(pickMode === "B" ? null : "B")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  pickMode === "B" ? "bg-red-500 text-white" : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                📍 Б {b ? "✓" : ""}
              </button>
            </div>

            <button
              disabled={!a || !b || loading}
              onClick={() => a && b && void loadRoute(a, b)}
              className="w-full rounded-lg bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              {loading ? "Строим маршрут…" : "Построить статистику маршрута"}
            </button>

            {error && <p className="text-xs text-red-400">{error}</p>}
            {pickMode && (
              <p className="text-xs text-sky-300">
                Кликни по карте, чтобы поставить точку {pickMode}.
              </p>
            )}

            <label className="block text-xs text-slate-400">
              Ширина коридора: <b className="text-slate-200">{bufferM} м</b>
              <input
                type="range"
                min={150}
                max={1500}
                step={50}
                value={bufferM}
                onChange={(e) => setBufferM(Number(e.target.value))}
                className="mt-1 w-full accent-orange-500"
              />
            </label>
          </div>
        </Card>

        {/* Карта маршрута */}
        <Card className="!p-0 overflow-hidden" >
          <div ref={mapEl} className="h-[420px] w-full lg:h-full lg:min-h-[520px]" />
        </Card>
      </div>

      {route && corridor && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card className="col-span-2 !py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Маршрут</div>
              <div className="mt-0.5 truncate font-semibold text-white">
                {a?.label ?? "A"} → {b?.label ?? "Б"}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {route.distanceKm.toFixed(1)} км · ~{Math.round(route.durationMin)} мин · коридор ±{bufferM} м
              </div>
            </Card>
            <Card className="!py-3 col-span-1">
              <div className="text-xs uppercase tracking-wider text-slate-400">ДТП в коридоре</div>
              <div className="mt-0.5 text-2xl font-bold text-orange-300">{corridor.total.toLocaleString("ru-RU")}</div>
            </Card>
            <Card className="!py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Погибли / ранены</div>
              <div className="mt-0.5 text-xl font-bold"><span className="text-red-400">{corridor.dead}</span> / <span className="text-amber-300">{corridor.injured}</span></div>
            </Card>
            <Card className="!py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Доля тяжёлых</div>
              <div className="mt-0.5 text-2xl font-bold text-white">{(corridor.severeShare * 100).toFixed(0)}%</div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Когда выезжать?" subtitle="Зелёный — самые спокойные часы, красный — опасные">
              <EChart option={hourChartOption!} height={260} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {corridor.bestHours.map((x) => (
                  <Badge key={"b" + x.h} tone="green">
                    ✅ {String(x.h).padStart(2, "0")}:00 ×{x.lift.toFixed(2)}
                  </Badge>
                ))}
                {corridor.worstHours.map((x) => (
                  <Badge key={"w" + x.h} tone="red">
                    ⚠️ {String(x.h).padStart(2, "0")}:00 ×{x.lift.toFixed(2)}
                  </Badge>
                ))}
              </div>
            </Card>
            <Card title="Месяцы" subtitle="Аварийность по месяцам вдоль маршрута">
              <EChart option={monthChartOption!} height={260} />
            </Card>
            <Card title="Сезоны">
              <EChart option={seasonPieOption!} height={260} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Типы ДТП на маршруте">
              <EChart option={catChartOption!} height={280} />
            </Card>
            <Card title="Автомобили участников" subtitle="Марки первого ТС в ДТП вдоль маршрута">
              {corridor.topBrands.length > 0 ? (
                <EChart option={brandChartOption!} height={280} />
              ) : (
                <p className="text-sm text-slate-500">В выбранном коридоре нет данных об автомобилях.</p>
              )}
            </Card>
          </div>

          {/* Советник */}
          <Card
            title="Персональные рекомендации для этого маршрута"
            subtitle="Правила построены по относительным рискам всей выборки региона"
          >
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-400">Твой стаж:</span>
              <select
                value={expBucket}
                onChange={(e) => setExpBucket(Number(e.target.value))}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs"
              >
                {data.experience.buckets.map((bk, i) => (
                  <option key={bk} value={i}>{bk} лет</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {routeTips.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-700/70 bg-slate-800/40 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-white">{t.title}</h4>
                    <Badge tone={t.lift >= 1.3 ? "red" : t.scope === "experience" ? "blue" : "orange"}>
                      ×{t.lift.toFixed(2)}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{t.text}</p>
                  <div className="mt-2 flex gap-1.5">
                    {t.tags.map((tag) => (
                      <span key={tag} className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
