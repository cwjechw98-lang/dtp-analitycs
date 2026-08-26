// Типы данных, генерируемых pipeline/build_*.py

export interface Meta {
  schema_version: number;
  generated_at_utc: string;
  source_url: string;
  opendata_page: string;
  region: string;
  total_accidents: number;
  skipped_records: number;
  date_min: string;
  date_max: string;
  bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  counts_by_year: Record<string, number>;
  totals: { dead: number; injured: number };
}

export interface Overview {
  by_year: { year: number; accidents: number; dead: number; injured: number }[];
  severity_totals: [number, number, number];
  categories: [string, number][];
  lights: [string, number][];
  weathers: [string, number][];
  roads: [string, number][];
}

export interface Temporal {
  weekdays: string[];
  tods: string[];
  seasons: string[];
  hour_weekday: number[][]; // [7][24]
  by_hour: number[]; // [24]
  hour_severity: number[][]; // [24][3]
  by_month: number[]; // [12]
  years: number[];
  month_year: number[][]; // [len(years)][12]
  season_counts: Record<string, number>;
  tod_severity: number[][]; // [4][3]
}

export interface Vehicles {
  top_brands: { name: string; count: number; severe_share: number }[];
  top_models: { brand: string; model: string; count: number }[];
  vehicle_categories: [string, number][];
  age_labels: string[];
  age_counts: number[];
}

export interface ExperienceStat {
  bucket: string;
  drivers: number;
  accidents: number;
  severe_share: number;
  night_share: number;
  avg_injured: number;
}

export interface Experience {
  buckets: string[];
  baseline_severe_share: number;
  stats: ExperienceStat[];
  bucket_season: number[][]; // [6][4]
  bucket_tod: number[][]; // [6][4]
}

/** Строка points.json — компактный массив:
 * [lat, lon, yyyymm, dow(0=Пн), hour, sevIdx, catIdx, lightIdx, weatherIdx,
 *  roadIdx, expBucketIdx(-1 нет данных), brandIdx(-1 нет ТС), dead, injured] */
export type PointRow = number[];

export interface Points {
  dicts: {
    cats: string[];
    sevs: string[];
    lights: string[];
    weathers: string[];
    roads: string[];
    brands: string[];
  };
  rows: PointRow[];
}

export interface TipRule {
  id: string;
  scope: "time" | "season_time" | "weather" | "light" | "road" | "experience" | "route";
  when: Record<string, unknown>;
  lift: number;
  n: number;
  title: string;
  text: string;
  tags: string[];
}

export interface Tips {
  generated_at_utc: string;
  baseline: { severe_share: number; accidents_total: number };
  thresholds: { min_n: number[]; lift_min: number };
  rules: TipRule[];
}
