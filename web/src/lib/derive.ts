import type { PointRow, Dictionaries, OverviewAgg, TemporalAgg } from "./types";
import { todOf, seasonOfYm } from "./time";
import { SEASON_NAMES, TOD_NAMES } from "./time";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Все производные агрегаты, которые клиент считает из строк одного региона. */
export interface RegionDerived {
  total: number;
  dead: number;
  injured: number;
  dateMin: string | null;
  dateMax: string | null;
  overview: OverviewAgg;
  temporal: TemporalAgg;
}

/** Индексы колонок строки points v2 */
export const COL = {
  LAT: 0, LON: 1, YM: 2, DOW: 3, HOUR: 4, SEV: 5, CAT: 6,
  LIGHT: 7, WEA: 8, ROAD: 9, EXP: 10, BRAND: 11, DEAD: 12, INJ: 13,
  CULPRIT: 14, VEH_COUNT: 15,
  // Semantic Research (Phase 1A) — битмаски, дописаны в конец строки
  VEH_SUPERS: 16, PART_TYPES: 17, OUTCOMES: 18, INFRA: 19, LOCAL_REGION: 20,
} as const;

export function deriveRegion(rows: PointRow[], d: Dictionaries): RegionDerived {
  const byYear = new Map<number, { a: number; d: number; i: number }>();
  const sevTot = [0, 0, 0];
  const cat = new Map<number, number>();
  const light = new Map<number, number>();
  const wea = new Map<number, number>();
  const road = new Map<number, number>();
  const hourWeekday: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const byHour = Array(24).fill(0);
  const hourSev: number[][] = Array.from({ length: 24 }, () => [0, 0, 0]);
  const byMonth = Array(12).fill(0);
  const monthYear = new Map<number, number[]>();
  const seasons = [0, 0, 0, 0];
  const todSev: number[][] = Array.from({ length: 4 }, () => [0, 0, 0]);

  let dead = 0, injured = 0;
  let dateMin: string | null = null, dateMax: string | null = null;

  for (const r of rows) {
    const ym = r[COL.YM];
    const year = Math.floor(ym / 100);
    const month = ym % 100;

    let y = byYear.get(year);
    if (!y) { y = { a: 0, d: 0, i: 0 }; byYear.set(year, y); }
    y.a++; y.d += r[COL.DEAD]; y.i += r[COL.INJ];
    dead += r[COL.DEAD]; injured += r[COL.INJ];

    sevTot[r[COL.SEV]]++;
    cat.set(r[COL.CAT], (cat.get(r[COL.CAT]) ?? 0) + 1);
    light.set(r[COL.LIGHT], (light.get(r[COL.LIGHT]) ?? 0) + 1);
    wea.set(r[COL.WEA], (wea.get(r[COL.WEA]) ?? 0) + 1);
    road.set(r[COL.ROAD], (road.get(r[COL.ROAD]) ?? 0) + 1);

    hourWeekday[r[COL.DOW]][r[COL.HOUR]]++;
    byHour[r[COL.HOUR]]++;
    hourSev[r[COL.HOUR]][r[COL.SEV]]++;
    byMonth[month - 1]++;
    let my = monthYear.get(year);
    if (!my) { my = Array(12).fill(0); monthYear.set(year, my); }
    my[month - 1]++;
    seasons[seasonOfYm(ym)]++;
    todSev[todOf(r[COL.HOUR])][r[COL.SEV]]++;

    const ds = `${year}-${String(month).padStart(2, "0")}-01`;
    if (dateMin === null || ds < dateMin) dateMin = ds;
    if (dateMax === null || ds > dateMax) dateMax = ds;
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const nameOf = <T,>(m: Map<T, number>, names: (k: T) => string): [string, number][] =>
    [...m.entries()].map(([k, c]) => [names(k), c] as [string, number]).sort((a, b) => b[1] - a[1]);

  return {
    total: rows.length,
    dead, injured, dateMin, dateMax,
    overview: {
      by_year: years.map((y) => ({ year: y, accidents: byYear.get(y)!.a, dead: byYear.get(y)!.d, injured: byYear.get(y)!.i })),
      severity_totals: sevTot as [number, number, number],
      categories: nameOf(cat, (i) => d.cats[i] ?? "—"),
      lights: nameOf(light, (i) => d.lights[i] ?? "—"),
      weathers: nameOf(wea, (i) => d.weathers[i] ?? "—"),
      roads: nameOf(road, (i) => d.roads[i] ?? "—"),
    },
    temporal: {
      weekdays: WEEKDAYS, tods: [...TOD_NAMES], seasons: [...SEASON_NAMES],
      hour_weekday: hourWeekday, by_hour: byHour, hour_severity: hourSev,
      by_month: byMonth, years,
      month_year: years.map((y) => monthYear.get(y)!),
      season_counts: Object.fromEntries(SEASON_NAMES.map((s, i) => [s, seasons[i]])),
      tod_severity: todSev,
    },
  };
}

export interface RegionCulprits {
  total: number;
  withVehicleCulprit: number;
  pedestrianOnly: number;
  noInfo: number;
  /** ДТП, где виновник за рулём марки */
  byBrand: { idx: number; count: number }[];
}

/** Виновники по маркам из строк региона (жертвы считаются только на национальном уровне). */
export function deriveRegionCulprits(rows: PointRow[]): RegionCulprits {
  const m = new Map<number, number>();
  let withVeh = 0, ped = 0, none = 0;
  for (const r of rows) {
    const c = r[COL.CULPRIT];
    if (c >= 0) { withVeh++; m.set(c, (m.get(c) ?? 0) + 1); }
    else if (c === -2) ped++;
    else none++;
  }
  return {
    total: rows.length,
    withVehicleCulprit: withVeh,
    pedestrianOnly: ped,
    noInfo: none,
    byBrand: [...m.entries()].map(([idx, count]) => ({ idx, count })).sort((a, b) => b.count - a.count),
  };
}
