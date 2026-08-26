import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { useApp } from "../state/AppState";
import { geohashDecode } from "../lib/geo";
import { SEV_COLORS } from "../lib/data";
import { createTileLayer, savedProviderId, saveProviderId } from "../lib/mapTiles";
import { deriveRegion } from "../lib/derive";
import { Badge, Card } from "./ui";
import TileSwitcher from "./TileSwitcher";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const TOD_NAMES = ["Ночь", "Утро", "День", "Вечер"];
const MAX_HEAT_DOTS = 14000;
/** Жёсткий потолок точек на карте региона — выше начинаются тормоза интерфейса. */
const MAX_REGION_MARKERS = 20000;
/** Сколько лет показывать по умолчанию, чтобы карта открывалась мгновенно. */
const DEFAULT_YEAR_WINDOW = 1;

function todOf(hour: number): number {
  if (hour >= 23 || hour < 6) return 0;
  if (hour < 12) return 1;
  if (hour < 18) return 2;
  return 3;
}

export default function MapTab() {
  const app = useApp();
  const isRu = app.scope === "ALL";
  return isRu ? <HeatMapMode /> : <RegionMapMode />;
}

/* ============================== Россия: плотность ============================== */
function HeatMapMode() {
  const app = useApp();
  const el = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [cells, setCells] = useState<{ lat: number; lon: number; total: number; severe: number }[]>([]);
  const [tileErrors, setTileErrors] = useState(0);
  const [tileId, setTileId] = useState(savedProviderId);
  const changeTiles = (id: string) => {
    setTileId(id);
    saveProviderId(id);
    setTileErrors(0);
  };

  useEffect(() => {
    app
      .loadHeatCells()
      .then((raw) => {
        const parsed = raw
          .map((c: (string | number)[]) => {
            const [lat, lon] = geohashDecode(String(c[0]));
            const s1 = Number(c[2]);
            const s2 = Number(c[3]);
            return { lat, lon, total: Number(c[1]) + s1 + s2, severe: s1 + s2 };
          })
          .sort((a: { total: number }, b: { total: number }) => b.total - a.total)
          .slice(0, MAX_HEAT_DOTS);
        setCells(parsed);
        setState("ready");
      })
      .catch(() => setState("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== "ready" || !el.current || mapRef.current) return;
    const map = L.map(el.current, { preferCanvas: true, minZoom: 2 }).setView([58, 60], 3);
    const tiles = createTileLayer(tileId, () => setTileErrors((n) => n + 1)).addTo(map);

    const maxTotal = cells.length ? cells[0].total : 1;
    for (const c of cells) {
      const t = Math.sqrt(c.total / maxTotal); // 0..1
      L.circleMarker([c.lat, c.lon], {
        radius: 2.5 + t * 7,
        fillColor: c.severe / c.total > 0.72 ? "#ef4444" : c.severe / c.total > 0.62 ? "#f59e0b" : "#fb923c",
        color: "transparent",
        fillOpacity: 0.28 + t * 0.45,
      })
        .bindTooltip(`${c.total.toLocaleString("ru-RU")} ДТП в ячейке ~5×5 км`)
        .addTo(map);
    }
    setTimeout(() => map.invalidateSize(), 60);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // tileId обрабатывается отдельным эффектом ниже
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cells]);

  // смена провайдера без пересоздания точек
  const tilesRef = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    const map = mapRef.current as L.Map | null;
    if (!map || state !== "ready") return;
    tilesRef.current?.remove();
    tilesRef.current = createTileLayer(tileId, () => setTileErrors((n) => n + 1)).addTo(map);
  }, [tileId, state]);

  return (
    <div className="space-y-3">
      <Card title="Плотность ДТП по стране" subtitle={`Топ-${cells.length.toLocaleString("ru-RU")} геохэш-ячеек ~5×5 км · размер и яркость точки = число аварий`}>
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          <Badge tone="orange">точка ≈ квадрат 5×5 км</Badge>
          <Badge tone="red">красные — доля тяжёлых &gt; 72%</Badge>
          <Badge>кликни по точке для числа ДТП</Badge>
        </div>
      </Card>
      <div className="relative overflow-hidden rounded-2xl border border-slate-800">
        <div ref={el} className="h-[74vh] min-h-[440px] w-full" />
        <TileSwitcher value={tileId} onChange={changeTiles} />
        {state === "loading" && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-900/70 text-sm text-slate-300">
            Загружаем тепловую карту страны…
          </div>
        )}
        {tileErrors > 8 && (
          <div className="absolute bottom-3 right-3 z-[500] rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200 ring-1 ring-red-500/40">
            Плитки карты подгружаются с ошибками — проверь интернет или отключи блокировщик.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== Регион: точки ============================== */
function RegionMapMode() {
  const app = useApp();
  const dicts = app.dicts;
  const el = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const years = useMemo(
    () =>
      Array.from(new Set((app.regionFile?.rows ?? []).map((r) => Math.floor(r[2] / 100)))).sort(),
    [app.regionFile],
  );
  const yMinDefault = years[0] ?? 2015;
  const yMaxDefault = years[years.length - 1] ?? new Date().getFullYear();

  /** По умолчанию — только последний год: карта открывается без тормозов. */
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [sevSel, setSevSel] = useState<boolean[]>([true, true, true]);
  const [cat, setCat] = useState("all");
  const [weather, setWeather] = useState("all");
  const [tod, setTod] = useState(-1);
  const [tileId, setTileId] = useState(savedProviderId);
  const changeTiles = (id: string) => {
    setTileId(id);
    saveProviderId(id);
  };

  const effYearFrom = yearFrom ?? Math.max(yMinDefault, yMaxDefault - DEFAULT_YEAR_WINDOW + 1);
  const effYearTo = yearTo ?? yMaxDefault;

  useEffect(() => {
    // при смене региона возвращаемся к годовому срезу
    setYearFrom(null);
    setYearTo(null);
  }, [app.scope]);

  const setPeriodYears = (n: number | "all") => {
    if (n === "all") {
      setYearFrom(yMinDefault);
      setYearTo(yMaxDefault);
    } else {
      setYearFrom(Math.max(yMinDefault, yMaxDefault - n + 1));
      setYearTo(yMaxDefault);
    }
  };

  useEffect(() => {
    if (!el.current || mapRef.current || !app.regionFile) return;
    const b = app.regionFile.bbox;
    const map = L.map(el.current, { preferCanvas: true });
    createTileLayer(tileId).addTo(map);
    map.fitBounds([[b[0], b[2]], [b[1], b[3]]]);
    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 42,
      showCoverageOnHover: false,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    setTimeout(() => map.invalidateSize(), 60);
    setReady(true);
    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.regionFile]);

  // смена провайдера без пересоздания кластеров
  const tilesRef2 = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    const map = mapRef.current as L.Map | null;
    if (!map || !ready) return;
    tilesRef2.current?.remove();
    tilesRef2.current = createTileLayer(tileId).addTo(map);
  }, [tileId, ready]);

  const filtered = useMemo(
    () =>
      (app.regionFile?.rows ?? []).filter((r) => {
        const y = Math.floor(r[2] / 100);
        if (y < effYearFrom || y > effYearTo) return false;
        if (!sevSel[r[5]]) return false;
        if (cat !== "all" && dicts.cats[r[6]] !== cat) return false;
        if (weather !== "all" && dicts.weathers[r[8]] !== weather) return false;
        if (tod >= 0 && todOf(r[4]) !== tod) return false;
        return true;
      }),
    [app.regionFile, effYearFrom, effYearTo, sevSel, cat, weather, tod, dicts],
  );

  /**
   * Прореживание: если выборка больше потолка — рисуем равномерную подвыборку,
   * чтобы интерфейс не подвисал. Статистика вкладок считается по полному набору.
   */
  const drawn = useMemo(() => {
    if (filtered.length <= MAX_REGION_MARKERS) return { rows: filtered, thinned: false };
    const step = Math.ceil(filtered.length / MAX_REGION_MARKERS);
    const rows = filtered.filter((_, i) => i % step === 0);
    return { rows, thinned: true };
  }, [filtered]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!ready || !cluster) return;
    cluster.clearLayers();
    for (const r of drawn.rows) {
      const m = L.circleMarker([r[0], r[1]], {
        radius: r[5] === 2 ? 7 : r[5] === 1 ? 5 : 4,
        fillColor: SEV_COLORS[r[5]],
        color: "#0b1220",
        weight: 1,
        fillOpacity: 0.85,
      });
      const ym = r[2];
      const when = `${MONTHS[(ym % 100) - 1]} ${Math.floor(ym / 100)}, ~${String(r[4]).padStart(2, "0")}:00`;
      const expTxt = r[10] >= 0 ? app.experience.buckets[r[10]] + " лет" : "нет данных";
      const parts: string[] = [
        `<b>${dicts.cats[r[6]] ?? "—"}</b>`,
        `<span style="color:${SEV_COLORS[r[5]]}">${dicts.sevs[r[5]]}</span> · ${when}`,
        `🕯️ ${dicts.lights[r[7]] ?? "—"}`,
        `🌤️ ${dicts.weathers[r[8]] ?? "—"} · 🛣️ ${dicts.roads[r[9]] ?? "—"}`,
      ];
      if (r[11] >= 0) parts.push(`🚗 ${dicts.brands[r[11]]}`);
      parts.push(`👨‍✈️ макс. стаж водителя: ${expTxt}`);
      if (r[14] >= 0) parts.push(`⚠️ виновник за рулём: <b>${dicts.brands[r[14]]}</b>`);
      else if (r[14] === -2) parts.push(`⚠️ виновник не за рулём (пешеход иное)`);
      if (r[12] > 0) parts.push(`<span style="color:#ef4444">☠️ погибло: ${r[12]}</span>`);
      if (r[13] > 0) parts.push(`🏥 ранено: ${r[13]}`);
      m.bindPopup(parts.join("<br/>"));
      cluster.addLayer(m);
    }
  }, [drawn, ready, dicts, app.experience.buckets]);

  const toggleSev = (i: number) => setSevSel((s) => s.map((v, j) => (j === i ? !v : v)));
  const selectCls =
    "rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 max-w-[220px]";

  if (!app.regionFile && !app.regionLoading) {
    return <Card title="Карта"><p className="text-sm text-slate-400">Выбери регион в шапке.</p></Card>;
  }

  return (
    <div className="space-y-4">
      <Card title="Фильтры" subtitle="По умолчанию показан только последний год — так карта остаётся быстрой. Расширяй период при необходимости.">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPeriodYears(1)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                effYearFrom === yMaxDefault && effYearTo === yMaxDefault
                  ? "bg-orange-500/25 text-orange-200 ring-1 ring-orange-500/50"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Год
            </button>
            <button
              onClick={() => setPeriodYears(3)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                effYearFrom === Math.max(yMinDefault, yMaxDefault - 2) && effYearTo === yMaxDefault
                  ? "bg-orange-500/25 text-orange-200 ring-1 ring-orange-500/50"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              3 года
            </button>
            <button
              onClick={() => setPeriodYears("all")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                effYearFrom === yMinDefault && effYearTo === yMaxDefault
                  ? "bg-orange-500/25 text-orange-200 ring-1 ring-orange-500/50"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Весь период
            </button>
          </div>

          <label className="flex items-center gap-2">
            с{" "}
            <select value={effYearFrom} onChange={(e) => setYearFrom(Number(e.target.value))} className={selectCls}>
              {(years.length ? years : [yMinDefault]).map((y) => (<option key={y}>{y}</option>))}
            </select>
            по{" "}
            <select value={effYearTo} onChange={(e) => setYearTo(Number(e.target.value))} className={selectCls}>
              {(years.length ? years : [yMaxDefault]).map((y) => (<option key={y}>{y}</option>))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                onClick={() => toggleSev(i)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  sevSel[i] ? "" : "border-slate-700 text-slate-500 line-through"
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
              {dicts.cats.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            Погода
            <select value={weather} onChange={(e) => setWeather(e.target.value)} className={selectCls}>
              <option value="all">Любая</option>
              {dicts.weathers.map((w) => (<option key={w} value={w}>{w}</option>))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            Время суток
            <select value={tod} onChange={(e) => setTod(Number(e.target.value))} className={selectCls}>
              <option value={-1}>Любое</option>
              {TOD_NAMES.map((t, i) => (<option key={t} value={i}>{t}</option>))}
            </select>
          </label>

          <span className="ml-auto text-xs text-slate-400">
            Показано:{" "}
            <b className="text-orange-300">
              {drawn.rows.length.toLocaleString("ru-RU")}
              {drawn.thinned ? ` из ${filtered.length.toLocaleString("ru-RU")}` : ""}
            </b>
          </span>
        </div>
        {drawn.thinned && (
          <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/30">
            ⚡ Выборка большая, поэтому на карту нанесена равномерная подвыборка из{" "}
            {MAX_REGION_MARKERS.toLocaleString("ru-RU")} точек. Сузь период или фильтры —
            и покажутся все происшествия.
          </p>
        )}
      </Card>

      <div className="relative overflow-hidden rounded-2xl border border-slate-800">
        <div ref={el} className="h-[70vh] min-h-[420px] w-full" />
        <TileSwitcher value={tileId} onChange={changeTiles} />
        {(!ready || app.regionLoading) && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-900/70 text-sm text-slate-300">
            Загружаем точки региона…
          </div>
        )}
        <div className="absolute bottom-3 left-3 z-[500] space-y-1.5 rounded-xl border border-slate-700 bg-slate-900/85 p-3 text-xs">
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
