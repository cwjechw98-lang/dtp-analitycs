import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/AppState";
import { useTheme } from "../state/ThemeContext";
import type { PointRow } from "../lib/types";
import { SEV_COLORS } from "../lib/data";
import EChart from "./EChart";
import { Badge, Card } from "./ui";
import { filterCorridor, haversine, pointInCircle, pointInPolygon } from "../lib/corridor";
// Leaflet импортируется СТАТИЧЕСКИ (как в MapTab): динамический import
// создаёт отдельный чанк с собственной копией Leaflet, в которую плагин
// markercluster не регистрируется — получаем "markerClusterGroup is not a function".
import L from "leaflet";
import "leaflet.markercluster";
import { fetchRoute, geocode, type GeoResult, type OsrmRoute } from "../lib/osrm";
import { seasonOfYm, todOf } from "../lib/time";
import {
  createTileLayer,
  DEFAULT_PROVIDER,
  savedProviderId,
  saveProviderId,
  TILE_PROVIDERS,
  tileWatchdog,
} from "../lib/mapTiles";
import TileSwitcher from "./TileSwitcher";
import type * as echarts from "echarts";

interface Pt { lat: number; lon: number; label: string }

const PRESETS: { name: string; a: Pt; b: Pt }[] = [
  {
    name: "Омск → Исилькуль (трасса на Тюмень)",
    a: { lat: 54.9885, lon: 73.3242, label: "Омск" },
    b: { lat: 54.9136, lon: 71.2685, label: "Исилькуль" },
  },
  {
    name: "Москва → Санкт-Петербург (М-10/Нева)",
    a: { lat: 55.7558, lon: 37.6173, label: "Москва" },
    b: { lat: 59.9386, lon: 30.3141, label: "Санкт-Петербург" },
  },
  {
    name: "Москва → Нижний Новгород (М-7)",
    a: { lat: 55.7558, lon: 37.6173, label: "Москва" },
    b: { lat: 56.2965, lon: 43.9361, label: "Нижний Новгород" },
  },
  {
    name: "Новосибирск → Барнаул",
    a: { lat: 55.0084, lon: 82.9357, label: "Новосибирск" },
    b: { lat: 53.3595, lon: 83.7698, label: "Барнаул" },
  },
];

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const SEASONS = ["Зима", "Весна", "Лето", "Осень"];
/** Бюджет строк для коридора: больше в память не берём, чтобы не подвешивать вкладку. */
const MAX_ROUTE_ROWS = 800_000;
/** Максимум файлов регионов на один маршрут. */
const MAX_ROUTE_REGIONS = 10;
/** Потолок точек ДТП, рисуемых на мини-карте (дальше — прореживание). */
const MAX_ROUTE_DOTS = 30_000;

/** Тип выделенной области. */
type SelShape =
  | { kind: "circle"; c: [number, number]; r: number }
  | { kind: "polygon"; pts: [number, number][] };

export interface CorridorStats {
  rows: PointRow[];
  total: number;
  dead: number;
  injured: number;
  severeShare: number;
  bestHours: { h: number; c: number; lift: number }[];
  worstHours: { h: number; c: number; lift: number }[];
  byHour: number[];
  byMonth: number[];
  seasonCnt: number[];
  topWeathersIdx: [number, number][];
  topCats: [string, number][];
  topBrands: [string, number][];
}

/** Считает статистику по набору строк (коридор маршрута или выделенная область). */
export function computeStats(rows: PointRow[], dicts: { cats: string[]; brands: string[] }): CorridorStats {
  const byHour = Array(24).fill(0);
  const byMonth = Array(12).fill(0);
  const seasonCnt = Array(4).fill(0);
  const weathers = new Map<number, number>();
  const cats = new Map<number, number>();
  const brands = new Map<number, number>();
  let dead = 0, injured = 0, severe = 0;
  for (const r of rows) {
    byHour[r[4]]++;
    byMonth[(r[2] % 100) - 1]++;
    seasonCnt[seasonOfYm(r[2])]++;
    weathers.set(r[8], (weathers.get(r[8]) ?? 0) + 1);
    cats.set(r[6], (cats.get(r[6]) ?? 0) + 1);
    brands.set(r[11], (brands.get(r[11]) ?? 0) + 1);
    dead += r[12]; injured += r[13];
    if (r[5] >= 1) severe++;
  }
  const total = rows.length;
  const mean = total / 24 || 1;
  const hoursSorted = byHour.map((c, h) => ({ h, c, lift: c / mean })).sort((x, y) => x.lift - y.lift);
  const top = <T,>(m: Map<T, number>, n: number, key: (k: T) => string): [string, number][] =>
    [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => [key(k), v]);
  return {
    rows, total, dead, injured,
    severeShare: total ? severe / total : 0,
    bestHours: hoursSorted.slice(0, 3),
    worstHours: hoursSorted.slice(-3).reverse(),
    byHour, byMonth, seasonCnt,
    topWeathersIdx: [...weathers.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5),
    topCats: top(cats, 10, (i) => dicts.cats[i] ?? "—"),
    topBrands: top(brands, 12, (i) => dicts.brands[i] ?? "—"),
  };
}

export default function RouteTab() {
  const app = useApp();
  const theme = useTheme();
  const [a, setA] = useState<Pt | null>(null);
  const [b, setB] = useState<Pt | null>(null);
  const [route, setRoute] = useState<OsrmRoute | null>(null);
  const [rows, setRows] = useState<PointRow[] | null>(null);
  const [regionsLoaded, setRegionsLoaded] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<"A" | "B" | null>(null);
  const [queryA, setQueryA] = useState("");
  const [queryB, setQueryB] = useState("");
  const [results, setResults] = useState<{ for: "A" | "B"; items: GeoResult[] } | null>(null);
  const [expBucket, setExpBucket] = useState(3);
  const [bufferM, setBufferM] = useState(400);
  /** Инструмент выделения: круг или полигон («свободная линия»). */
  const [selTool, setSelTool] = useState<"none" | "circle" | "polygon">("none");
  const [selShape, setSelShape] = useState<SelShape | null>(null);
  const [selRows, setSelRows] = useState<PointRow[] | null>(null);

  // ---- мини-карта ----
  const mapEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layersRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accDotsRef = useRef<any>(null); // кластер точек ДТП
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selRef = useRef<any>(null); // слой фигуры выделения
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selDrawRef = useRef<any>(null); // черновик выделения
  const pickRef = useRef<"A" | "B" | null>(null);
  const selToolRef = useRef<"none" | "circle" | "polygon">("none");
  const selPtsRef = useRef<[number, number][]>([]); // вершины полигона
  const selCenterRef = useRef<[number, number] | null>(null); // центр круга
  const [mapReady, setMapReady] = useState(false);
  const [tileId, setTileId] = useState(savedProviderId);
  const [tileNotice, setTileNotice] = useState<string | null>(null);
  const changeTiles = (id: string) => {
    setTileId(id);
    saveProviderId(id);
    setTileNotice(null);
  };

  useEffect(() => { pickRef.current = pickMode; }, [pickMode]);
  useEffect(() => { selToolRef.current = selTool; }, [selTool]);

  /** Отрисовка фигуры выделения и пересчёт статистики по ней. */
  useEffect(() => {
    (async () => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      selRef.current?.clearLayers();
      if (!selShape) {
        setSelRows(null);
        return;
      }
      if (selShape.kind === "circle") {
        L.circle(selShape.c, { radius: selShape.r, color: "#38bdf8", weight: 2, fillColor: "#38bdf8", fillOpacity: 0.1 }).addTo(selRef.current);
      } else {
        L.polygon(selShape.pts, { color: "#38bdf8", weight: 2, fillColor: "#38bdf8", fillOpacity: 0.1 }).addTo(selRef.current);
      }
      const inSel = (rows ?? []).filter((r) =>
        selShape.kind === "circle"
          ? pointInCircle(r[0], r[1], selShape.c, selShape.r)
          : pointInPolygon(r[0], r[1], selShape.pts),
      );
      setSelRows(inSel.length ? inSel : []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selShape, rows, mapReady]);

  /** Точки ДТП вдоль маршрута с карточкой при наведении. */
  useEffect(() => {
    (async () => {
      const cluster = accDotsRef.current;
      if (!cluster || !mapReady) return;
      cluster.clearLayers();
      if (!rows || rows.length === 0) return;
      const step = Math.max(1, Math.ceil(rows.length / MAX_ROUTE_DOTS));
      for (let i = 0; i < rows.length; i += step) {
        const r = rows[i];
        const ym = r[2];
        const when = `${MONTHS[(ym % 100) - 1]} ${Math.floor(ym / 100)}, ~${String(r[4]).padStart(2, "0")}:00`;
        const parts: string[] = [
          `<b>${app.dicts.cats[r[6]] ?? "—"}</b>`,
          `<span style="color:${SEV_COLORS[r[5]]}">${app.dicts.sevs[r[5]]}</span> · ${when}`,
          `🕯️ ${app.dicts.lights[r[7]] ?? "—"}`,
          `🌤️ ${app.dicts.weathers[r[8]] ?? "—"} · 🛣️ ${app.dicts.roads[r[9]] ?? "—"}`,
        ];
        if (r[11] >= 0) parts.push(`🚗 ${app.dicts.brands[r[11]]}`);
        if (r[14] >= 0) parts.push(`⚠️ виновник за рулём: <b>${app.dicts.brands[r[14]]}</b>`);
        else if (r[14] === -2) parts.push(`⚠️ виновник не за рулём`);
        if (r[12] > 0) parts.push(`<span style="color:#ef4444">☠️ погибло: ${r[12]}</span>`);
        if (r[13] > 0) parts.push(`🏥 ранено: ${r[13]}`);
        L.circleMarker([r[0], r[1]], {
          radius: r[5] === 2 ? 6 : r[5] === 1 ? 5 : 3.5,
          fillColor: SEV_COLORS[r[5]],
          color: "#0b1220",
          weight: 1,
          fillOpacity: 0.9,
        })
          .bindTooltip(parts.join("<br/>"), { sticky: true })
          .bindPopup(parts.join("<br/>"))
          .addTo(cluster);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mapReady]);

  useEffect(() => {
    const node = mapEl.current;
    if (!node || mapRef.current) return;
    let destroyed = false;
    (async () => {
      if (destroyed || !node) return;
      const map = L.map(node, { preferCanvas: true, maxZoom: 19 }).setView([56, 44], 5);
      const group = L.layerGroup().addTo(map);
      accDotsRef.current = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 42 }).addTo(map);
      selRef.current = L.layerGroup().addTo(map);
      selDrawRef.current = L.layerGroup().addTo(map);

      /** Перерисовать предпросмотр выделения. */
      const refreshDraft = () => {
        const dg = selDrawRef.current;
        if (!dg) return;
        dg.clearLayers();
        const Lx = L;
        if (selToolRef.current === "circle" && selCenterRef.current) {
          const [clat, clon] = selCenterRef.current;
          Lx.circle([clat, clon], { radius: 5, color: "#38bdf8", weight: 1 })
            .bindTooltip("Радиус: перетащи курсор и кликни ещё раз").addTo(dg);
        }
        if (selToolRef.current === "polygon" && selPtsRef.current.length >= 1) {
          const pts = selPtsRef.current;
          pts.forEach(([la, lo], i) => {
            Lx.circleMarker([la, lo], { radius: 4, color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 1 })
              .bindTooltip(`Точка ${i + 1}`).addTo(dg);
          });
          if (pts.length >= 2) {
            Lx.polyline(pts, { color: "#38bdf8", weight: 2, dashArray: "4 6" }).addTo(dg);
          }
        }
      };

      map.on("click", (e: L.LeafletMouseEvent) => {
        const tool = selToolRef.current;
        if (tool === "circle") {
          if (!selCenterRef.current) {
            selCenterRef.current = [e.latlng.lat, e.latlng.lng];
            refreshDraft();
            return;
          }
          const [clat, clon] = selCenterRef.current;
          const r = haversine(clat, clon, e.latlng.lat, e.latlng.lng);
          if (r < 50) return; // слишком мелко
          setSelShape({ kind: "circle", c: [clat, clon], r });
          selCenterRef.current = null;
          selDrawRef.current?.clearLayers();
          setSelTool("none");
          return;
        }
        if (tool === "polygon") {
          selPtsRef.current = [...selPtsRef.current, [e.latlng.lat, e.latlng.lng]];
          refreshDraft();
          return;
        }
        const mode = pickRef.current;
        if (!mode) return;
        setResults(null);
        const pt = { lat: e.latlng.lat, lon: e.latlng.lng, label: `Точка (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})` };
        if (mode === "A") { setA(pt); setPickMode("B"); }
        else { setB(pt); setPickMode(null); }
      });
      map.on("dblclick", (e: L.LeafletMouseEvent) => {
        if (selToolRef.current !== "polygon") return;
        L.DomEvent.stop(e.originalEvent);
        if (selPtsRef.current.length < 3) {
          selPtsRef.current = [];
          selDrawRef.current?.clearLayers();
          return;
        }
        setSelShape({ kind: "polygon", pts: [...selPtsRef.current] });
        selPtsRef.current = [];
        selDrawRef.current?.clearLayers();
        setSelTool("none");
      });
      map.on("mousemove", (e: L.LeafletMouseEvent) => {
        if (selToolRef.current === "circle" && selCenterRef.current) {
          const [clat, clon] = selCenterRef.current;
          const r = haversine(clat, clon, e.latlng.lat, e.latlng.lng);
          const dg = selDrawRef.current;
          if (!dg) return;
          dg.clearLayers();
          L.circle([clat, clon], { radius: Math.max(r, 20), color: "#38bdf8", weight: 1.5, dashArray: "4 6", fillOpacity: 0.08 })
            .addTo(dg);
          L.circleMarker([clat, clon], { radius: 5, color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 1 })
            .addTo(dg);
        }
      });
      setTimeout(() => map.invalidateSize(), 60);
      mapRef.current = map;
      layersRef.current = group;
      setMapReady(true);
    })();
    return () => {
      destroyed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // смена провайдера тайлов на мини-карте
  useEffect(() => {
    (async () => {
      if (!mapReady) return;
      const map = mapRef.current as L.Map | null;
      if (!map) return;
      map.eachLayer((l) => {
        if (l instanceof L.TileLayer) map.removeLayer(l);
      });
      const wd = tileWatchdog(() => {
        if (tileId !== DEFAULT_PROVIDER) {
          const name = TILE_PROVIDERS.find((p) => p.id === tileId)?.name ?? tileId;
          setTileNotice(`Провайдер «${name}» не отвечает — переключились на OSM.`);
          changeTiles(DEFAULT_PROVIDER);
        }
      });
      createTileLayer(tileId, { error: wd.onError, load: wd.onLoad }).addTo(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileId, mapReady]);

  useEffect(() => {
    (async () => {
      const group = layersRef.current;
      if (!group) return;
      group.clearLayers();
      if (a)
        L.circleMarker([a.lat, a.lon], { radius: 8, color: "#38bdf8", fillOpacity: 1, fillColor: "#38bdf8" })
          .bindTooltip("A: " + a.label).addTo(group);
      if (b)
        L.circleMarker([b.lat, b.lon], { radius: 8, color: "#ef4444", fillOpacity: 1, fillColor: "#ef4444" })
          .bindTooltip("Б: " + b.label).addTo(group);
      if (route) {
        const line = L.polyline(route.geometry, { color: "#f97316", weight: 5, opacity: 0.85 });
        line.addTo(group);
        mapRef.current?.fitBounds(line.getBounds(), { padding: [24, 24] });
      }
    })();
  }, [a, b, route]);

  async function loadRoute(pa: Pt, pb: Pt) {
    setLoading(true);
    setError(null);
    setRows(null);
    setRegionsLoaded([]);
    setTruncated(false);
    setSelShape(null);
    setSelRows(null);
    setSelTool("none");
    selCenterRef.current = null;
    selPtsRef.current = [];
    selDrawRef.current?.clearLayers();
    try {
      const r = await fetchRoute([pa.lat, pa.lon], [pb.lat, pb.lon]);
      setRoute(r);
      // какие регионы пересекает bbox маршрута
      const lats = r.geometry.map((g) => g[0]);
      const lons = r.geometry.map((g) => g[1]);
      const bb = { la0: Math.min(...lats), la1: Math.max(...lats), lo0: Math.min(...lons), lo1: Math.max(...lons) };
      const hit = app.meta.regions.filter(
        (rg) =>
          !(rg.bbox[0] > bb.la1 || rg.bbox[1] < bb.la0 || rg.bbox[2] > bb.lo1 || rg.bbox[3] < bb.lo0),
      );
      if (hit.length === 0) {
        // Фолбэк: маршрут между кластерами регионов — берём ближайшие по центру
        const laC = (bb.la0 + bb.la1) / 2;
        const loC = (bb.lo0 + bb.lo1) / 2;
        hit.push(
          ...[...app.meta.regions]
            .map((rg) => ({
              rg,
              d:
                Math.pow((rg.bbox[0] + rg.bbox[1]) / 2 - laC, 2) +
                Math.pow((rg.bbox[2] + rg.bbox[3]) / 2 - loC, 2),
            }))
            .sort((x, y) => x.d - y.d)
            .slice(0, 4)
            .map((x) => x.rg),
        );
      }
      hit.sort((x, y) => y.total - x.total);
      const chosen = hit.slice(0, MAX_ROUTE_REGIONS); // ограничиваем объём загрузки
      const MARGIN = 0.35; // ° запаса вокруг bbox маршрута при предфильтре строк
      let acc: PointRow[] = [];
      let truncated = false;
      for (const rg of chosen) {
        const f = await app.loadRegion(rg.slug);
        // дешёвый предфильтр прямоугольником — режем объём до коридорного расчёта
        for (const r of f.rows) {
          if (
            r[0] >= bb.la0 - MARGIN && r[0] <= bb.la1 + MARGIN &&
            r[1] >= bb.lo0 - MARGIN && r[1] <= bb.lo1 + MARGIN
          ) {
            acc.push(r);
          }
        }
        setRegionsLoaded((s) => [...s, rg.name]);
        if (acc.length >= MAX_ROUTE_ROWS) {
          truncated = true;
          break;
        }
      }
      if (truncated) acc = acc.slice(0, MAX_ROUTE_ROWS);
      const inCorridor = filterCorridor(acc, r.geometry, bufferM);
      setRows(inCorridor);
      setTruncated(truncated);
    } catch (e) {
      setRoute(null);
      setError(
        e instanceof Error
          ? `${e.message}`
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
      setError("Геокодинг недоступен — укажи точку кликом по карте.");
    }
  }

  function chooseResult(r: GeoResult, which: "A" | "B") {
    const pt = { lat: r.lat, lon: r.lon, label: r.name.split(",").slice(0, 3).join(",") };
    setResults(null);
    if (which === "A") setA(pt);
    else setB(pt);
  }

  // ---- статистика коридора ----
  const corridor = useMemo(
    () => (rows && route ? computeStats(rows, app.dicts) : null),
    [rows, route, app.dicts],
  );
  const selStats = useMemo(
    () => (selRows && selRows.length ? computeStats(selRows, app.dicts) : null),
    [selRows, app.dicts],
  );

  const routeTips = useMemo(() => {
    if (!corridor) return [];
    const rules = [...app.tips.rules];
    const scored = rules
      .filter((t) => {
        if (t.scope === "experience") return t.when.experience_bucket === app.experience.buckets[expBucket];
        if (t.scope === "weather")
          return corridor.topWeathersIdx.some(([wi]) => app.dicts.weathers[wi] === t.when.weather);
        return t.scope !== "light" && t.scope !== "road";
      })
      .sort((x, y) => y.lift - x.lift)
      .slice(0, 6);
    return scored;
  }, [corridor, app.tips.rules, expBucket, app.experience.buckets, app.dicts.weathers]);

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
      series: [{ type: "bar", data: corridor.byMonth, itemStyle: { color: "#818cf8", borderRadius: [4, 4, 0, 0] } }],
    };
  }, [corridor]);

  const seasonPieOption: echarts.EChartsOption | null = useMemo(() => {
    if (!corridor) return null;
    const palette = ["#60a5fa", "#34d399", "#fbbf24", "#fb923c"];
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { color: "#94a3b8" } },
      series: [{
        type: "pie", radius: ["40%", "66%"], center: ["50%", "45%"],
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
      yAxis: { type: "category", data: corridor.topCats.map((c) => c[0]).reverse().map((s) => (s.length > 30 ? s.slice(0, 29) + "…" : s)), axisLabel: { fontSize: 11 } },
      series: [{
        type: "bar", data: corridor.topCats.map((c) => c[1]).reverse(),
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
      yAxis: { type: "category", data: corridor.topBrands.map((c) => c[0]).reverse(), axisLabel: { fontSize: 11 } },
      series: [{
        type: "bar", data: corridor.topBrands.map((c) => c[1]).reverse(),
        itemStyle: { color: theme.accentMain, borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: "#94a3b8" },
      }],
    };
  }, [corridor]);

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder:text-slate-500 focus:border-orange-500 outline-none";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title="Маршрут А → Б по всей России" subtitle="Пресеты, поиск адреса или клик по карте">
          <div className="space-y-3">
            <select className={inputCls} defaultValue="" onChange={(e) => { if (e.target.value !== "") applyPreset(Number(e.target.value)); }}>
              <option value="" disabled>Готовые маршруты…</option>
              {PRESETS.map((p, i) => (<option key={p.name} value={i}>{p.name}</option>))}
            </select>

            {(["A", "B"] as const).map((which) => (
              <div key={which}>
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    placeholder={which === "A" ? "Точка А: город, адрес…" : "Точка Б: город, адрес…"}
                    value={which === "A" ? queryA : queryB}
                    onChange={(e) => (which === "A" ? setQueryA : setQueryB)(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void doGeocode(which)}
                  />
                  <button onClick={() => void doGeocode(which)} className="rounded-lg bg-slate-700 px-3 text-sm hover:bg-slate-600">🔍</button>
                </div>
                {results?.for === which && (
                  <ul className="mt-1 max-h-44 space-y-1 overflow-auto rounded-lg border border-slate-700 bg-slate-800 p-1 text-xs">
                    {results.items.length === 0 && <li className="px-2 py-1 text-slate-400">Ничего не найдено</li>}
                    {results.items.map((r, i) => (
                      <li key={i}>
                        <button className="w-full rounded px-2 py-1 text-left hover:bg-slate-700" onClick={() => chooseResult(r, which)}>
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
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${pickMode === "A" ? "bg-sky-500 text-white" : "bg-slate-700 hover:bg-slate-600"}`}
              >
                📍 A {a ? "✓" : ""}
              </button>
              <button
                onClick={() => setPickMode(pickMode === "B" ? null : "B")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${pickMode === "B" ? "bg-red-500 text-white" : "bg-slate-700 hover:bg-slate-600"}`}
              >
                📍 Б {b ? "✓" : ""}
              </button>
            </div>

            <button
              disabled={!a || !b || loading}
              onClick={() => a && b && void loadRoute(a, b)}
              className="glow-ring w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              {loading ? "Собираем статистику вдоль маршрута…" : "Построить статистику маршрута"}
            </button>

            {error && <p className="text-xs text-red-400">{error}</p>}
            {pickMode && <p className="text-xs text-sky-300">Кликни по карте, чтобы поставить точку {pickMode}.</p>}
            {loading && regionsLoaded.length > 0 && (
              <p className="text-[11px] leading-snug text-slate-500">
                Загружены данные: {regionsLoaded.join(", ")}…
              </p>
            )}
            {truncated && !loading && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-200 ring-1 ring-amber-500/30">
                ⚡ Маршрут очень длинный: статистика собрана по первым ~
                {(MAX_ROUTE_ROWS / 1000).toFixed(0)} тыс. ближайших к трассе записей.
                Для сверхдлинных маршрутов разбей путь на этапы — точность вырастет.
              </p>
            )}

            <label className="block text-xs text-slate-400">
              Ширина коридора: <b className="text-slate-200">{bufferM} м</b>
              <input type="range" min={150} max={1500} step={50} value={bufferM}
                onChange={(e) => setBufferM(Number(e.target.value))}
                className="mt-1 w-full accent-orange-500" />
            </label>
          </div>
        </Card>

        <Card className="overflow-hidden !p-0">
          {/* Фиксированная высота: h-full внутри грида вызывал бесконечное растягивание страницы */}
          <div className="relative">
            <div ref={mapEl} className="h-[440px] w-full sm:h-[560px]" />
            <TileSwitcher value={tileId} onChange={changeTiles} />
            {tileNotice && (
              <div className="absolute left-3 top-3 z-[600] max-w-[300px] rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-100 backdrop-blur">
                {tileNotice}
              </div>
            )}
            {/* Панель инструментов выделения */}
            <div className="absolute left-3 top-3 z-[600] flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/85 p-1.5 text-xs shadow-lg backdrop-blur">
              <span className="px-1.5 text-[10px] uppercase tracking-wider text-slate-500">Выделить</span>
              <button
                onClick={() => {
                  setSelTool(selTool === "circle" ? "none" : "circle");
                  setSelShape(null);
                  setSelRows(null);
                  selCenterRef.current = null;
                  selPtsRef.current = [];
                  selDrawRef.current?.clearLayers();
                }}
                className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                  selTool === "circle" ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Кругом: клик — центр, второй клик — радиус"
              >
                ⭕ Кругом
              </button>
              <button
                onClick={() => {
                  setSelTool(selTool === "polygon" ? "none" : "polygon");
                  setSelShape(null);
                  setSelRows(null);
                  selCenterRef.current = null;
                  selPtsRef.current = [];
                  selDrawRef.current?.clearLayers();
                }}
                className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                  selTool === "polygon" ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Свободной линией: клики добавляют вершины, двойной клик завершает"
              >
                ✏️ Линией
              </button>
              <button
                onClick={() => {
                  setSelTool("none");
                  setSelShape(null);
                  setSelRows(null);
                  selCenterRef.current = null;
                  selPtsRef.current = [];
                  selDrawRef.current?.clearLayers();
                }}
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 font-medium text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              >
                ✖ Сброс
              </button>
            </div>
            {selTool === "circle" && (
              <p className="absolute bottom-3 left-3 z-[600] rounded-lg bg-slate-900/85 px-2.5 py-1.5 text-[11px] text-sky-300 shadow-lg backdrop-blur">
                Клик — центр круга, второй клик задаёт радиус
              </p>
            )}
            {selTool === "polygon" && (
              <p className="absolute bottom-3 left-3 z-[600] rounded-lg bg-slate-900/85 px-2.5 py-1.5 text-[11px] text-sky-300 shadow-lg backdrop-blur">
                Клики — вершины, <b>двойной клик</b> завершает область
              </p>
            )}
          </div>
        </Card>
      </div>

      {selShape && selStats && (
        <Card
          title={`📊 Статистика выделенной области · ${selShape.kind === "circle" ? `круг ≈ ${(selShape.r / 1000).toFixed(1)} км` : "полигон"}`}
          subtitle={`${selRows!.length.toLocaleString("ru-RU")} ДТП внутри области`}
        >
          <div className="mb-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-slate-800/60 px-3 py-1.5">ДТП: <b className="text-white">{selStats.total.toLocaleString("ru-RU")}</b></span>
            <span className="rounded-lg bg-slate-800/60 px-3 py-1.5">Погибли: <b className="text-red-400">{selStats.dead}</b></span>
            <span className="rounded-lg bg-slate-800/60 px-3 py-1.5">Ранены: <b className="text-amber-300">{selStats.injured}</b></span>
            <span className="rounded-lg bg-slate-800/60 px-3 py-1.5">Доля тяжёлых: <b className="text-white">{(selStats.severeShare * 100).toFixed(0)}%</b></span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Типы ДТП в выделении" className="!p-4">
              <EChart
                option={{
                  tooltip: {},
                  grid: { left: 170, right: 30, top: 8, bottom: 24 },
                  xAxis: { type: "value" },
                  yAxis: { type: "category", data: selStats.topCats.map((c) => c[0]).reverse().map((s) => (s.length > 30 ? s.slice(0, 29) + "…" : s)), axisLabel: { fontSize: 11 } },
                  series: [{ type: "bar", data: selStats.topCats.map((c) => c[1]).reverse(), itemStyle: { color: SEV_COLORS[1], borderRadius: [0, 6, 6, 0] }, label: { show: true, position: "right", color: "#94a3b8" } }],
                }}
                height={240}
              />
            </Card>
            <Card title="Марки в выделении" className="!p-4">
              {selStats.topBrands.length > 0 ? (
                <EChart
                  option={{
                    tooltip: {},
                    grid: { left: 150, right: 30, top: 8, bottom: 24 },
                    xAxis: { type: "value" },
                    yAxis: { type: "category", data: selStats.topBrands.map((c) => c[0]).reverse(), axisLabel: { fontSize: 11 } },
                    series: [{ type: "bar", data: selStats.topBrands.map((c) => c[1]).reverse(), itemStyle: { color: theme.accentMain, borderRadius: [0, 6, 6, 0] }, label: { show: true, position: "right", color: "#94a3b8" } }],
                  }}
                  height={240}
                />
              ) : (
                <p className="text-sm text-slate-500">Нет данных об автомобилях.</p>
              )}
            </Card>
          </div>
        </Card>
      )}

      {route && (
        <Card title="Статистика коридора">
          <p className="text-sm text-slate-400">
            {loading
              ? "Фильтруем ДТП в коридоре и загружаем регионы вдоль маршрута…"
              : rows
                ? `В коридоре ±${bufferM} м найдено ${rows.length.toLocaleString("ru-RU")} ДТП. Ниже — подробности.`
                : "Ожидание…"}
          </p>
        </Card>
      )}

      {route && corridor && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card className="col-span-2 !py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Маршрут</div>
              <div className="mt-0.5 truncate font-semibold text-white">{a?.label ?? "A"} → {b?.label ?? "Б"}</div>
              <div className="mt-0.5 text-xs text-slate-400">{route.distanceKm.toFixed(1)} км · ~{Math.round(route.durationMin)} мин · коридор ±{bufferM} м</div>
            </Card>
            <Card className="!py-3">
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
            <Card title="Когда выезжать?" subtitle="Зелёный — спокойные часы, красный — опасные">
              <EChart option={hourChartOption!} height={260} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {corridor.bestHours.map((x) => (
                  <Badge key={"b" + x.h} tone="green">✅ {String(x.h).padStart(2, "0")}:00 ×{x.lift.toFixed(2)}</Badge>
                ))}
                {corridor.worstHours.map((x) => (
                  <Badge key={"w" + x.h} tone="red">⚠️ {String(x.h).padStart(2, "0")}:00 ×{x.lift.toFixed(2)}</Badge>
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

          <Card title="Персональные рекомендации для этого маршрута" subtitle="Правила рассчитаны по всей стране · совпадение с погодой и составом потока на маршруте">
            <div className="mb-3 flex items-center gap-3 text-sm">
              <span className="text-slate-400">Твой стаж:</span>
              <select value={expBucket} onChange={(e) => setExpBucket(Number(e.target.value))} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs">
                {app.experience.buckets.map((bk, i) => (<option key={bk} value={i}>{bk} лет</option>))}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {routeTips.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-700/70 bg-slate-800/40 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-white">{t.title}</h4>
                    <Badge tone={t.lift >= 1.3 ? "red" : t.scope === "experience" ? "blue" : "orange"}>×{t.lift.toFixed(2)}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{t.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
