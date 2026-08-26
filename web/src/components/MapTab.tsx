import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import type { Datasets } from "../lib/data";
import { SEV_COLORS } from "../lib/data";
import { Card } from "./ui";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const TOD_NAMES = ["Ночь", "Утро", "День", "Вечер"];

function todOf(hour: number): number {
  if (hour >= 23 || hour < 6) return 0;
  if (hour < 12) return 1;
  if (hour < 18) return 2;
  return 3;
}

export default function MapTab({ data }: { data: Datasets }) {
  const el = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterRef = useRef<any>(null);

  const [yearFrom, setYearFrom] = useState(2015);
  const [yearTo, setYearTo] = useState(new Date().getFullYear());
  const [sevSel, setSevSel] = useState<boolean[]>([true, true, true]);
  const [cat, setCat] = useState("all");
  const [weather, setWeather] = useState("all");
  const [tod, setTod] = useState(-1);

  const dicts = data.points.dicts;

  const years = useMemo(() => {
    const ys = Object.keys(data.meta.counts_by_year).map(Number).sort();
    return ys;
  }, [data]);

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const b = data.meta.bbox;
    const map = L.map(el.current, { preferCanvas: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);
    map.fitBounds([
      [b.lat_min, b.lon_min],
      [b.lat_max, b.lon_max],
    ]);
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 42,
      showCoverageOnHover: false,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    setReady(true);
    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, [data]);

  const [ready, setReady] = useState(false);

  const filtered = useMemo(
    () =>
      data.points.rows.filter((r) => {
        const y = Math.floor(r[2] / 100);
        if (y < yearFrom || y > yearTo) return false;
        if (!sevSel[r[5]]) return false;
        if (cat !== "all" && dicts.cats[r[6]] !== cat) return false;
        if (weather !== "all" && dicts.weathers[r[8]] !== weather) return false;
        if (tod >= 0 && todOf(r[4]) !== tod) return false;
        return true;
      }),
    [data, yearFrom, yearTo, sevSel, cat, weather, tod, dicts],
  );

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!ready || !cluster) return;
    cluster.clearLayers();
    for (const r of filtered) {
      const m = L.circleMarker([r[0], r[1]], {
          radius: r[5] === 2 ? 7 : r[5] === 1 ? 5 : 4,
          fillColor: SEV_COLORS[r[5]],
          color: "#0b1220",
          weight: 1,
          fillOpacity: 0.85,
        });
        const ym = r[2];
        const when = `${MONTHS[(ym % 100) - 1]} ${Math.floor(ym / 100)}, ~${String(r[4]).padStart(2, "0")}:00`;
        const expTxt = r[10] >= 0 ? data.experience.buckets[r[10]] + " лет" : "нет данных";
        const parts: string[] = [
          `<b>${dicts.cats[r[6]] ?? "—"}</b>`,
          `<span style="color:${SEV_COLORS[r[5]]}">${dicts.sevs[r[5]]}</span> · ${when}`,
          `🕯️ ${dicts.lights[r[7]] ?? "—"}`,
          `🌤️ ${dicts.weathers[r[8]] ?? "—"} · 🛣️ ${dicts.roads[r[9]] ?? "—"}`,
        ];
        if (r[11] >= 0) parts.push(`🚗 ${dicts.brands[r[11]]}`);
        parts.push(`👨‍✈️ макс. стаж водителя: ${expTxt}`);
        if (r[12] > 0) parts.push(`<span style="color:#ef4444">☠️ погибло: ${r[12]}</span>`);
        if (r[13] > 0) parts.push(`🏥 ранено: ${r[13]}`);
        m.bindPopup(parts.join("<br/>"));
        cluster.addLayer(m);
      }
  }, [filtered, ready, dicts, data]);

  const toggleSev = (i: number) =>
    setSevSel((s) => s.map((v, j) => (j === i ? !v : v)));

  const selectCls =
    "rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 max-w-[220px]";

  return (
    <div className="space-y-4">
      <Card title="Фильтры">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            с{" "}
            <select value={yearFrom} onChange={(e) => setYearFrom(Number(e.target.value))} className={selectCls}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
            по{" "}
            <select value={yearTo} onChange={(e) => setYearTo(Number(e.target.value))} className={selectCls}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>

          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                onClick={() => toggleSev(i)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                  sevSel[i]
                    ? "border-transparent"
                    : "border-slate-700 text-slate-500 line-through"
                }`}
                style={
                  sevSel[i]
                    ? { backgroundColor: `${SEV_COLORS[i]}22`, color: SEV_COLORS[i], borderColor: SEV_COLORS[i] }
                    : undefined
                }
              >
                {dicts.sevs[i]}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2">
            Категория
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={selectCls}>
              <option value="all">Все</option>
              {dicts.cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2">
            Погода
            <select value={weather} onChange={(e) => setWeather(e.target.value)} className={selectCls}>
              <option value="all">Любая</option>
              {dicts.weathers.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2">
            Время суток
            <select value={tod} onChange={(e) => setTod(Number(e.target.value))} className={selectCls}>
              <option value={-1}>Любое</option>
              {TOD_NAMES.map((t, i) => <option key={t} value={i}>{t}</option>)}
            </select>
          </label>

          <span className="ml-auto text-xs text-slate-400">
            Показано: <b className="text-orange-300">{filtered.length.toLocaleString("ru-RU")}</b> точек
          </span>
        </div>
      </Card>

      <div className="relative overflow-hidden rounded-2xl border border-slate-800">
        <div ref={el} className="h-[70vh] min-h-[420px] w-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-sm text-slate-400">
            Загружаем карту…
          </div>
        )}
        <div className="absolute bottom-3 left-3 z-[500] rounded-xl border border-slate-700 bg-slate-900/85 p-3 text-xs space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLORS[i] }} />
              <span className="text-slate-300">{dicts.sevs[i]}</span>
            </div>
          ))}
          <div className="pt-1 text-[10px] text-slate-500">клик по точке — детали ДТП</div>
        </div>
      </div>
    </div>
  );
}
