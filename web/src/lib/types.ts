// Типы данных v2: вся Россия + регионы

export interface MetaRegion {
  slug: string;
  name: string;
  total: number;
  date_min: string | null;
  date_max: string | null;
  bbox: [number, number, number, number]; // [latMin, latMax, lonMin, lonMax]
}

export interface Meta {
  schema_version: number;
  generated_at_utc: string;
  source_page: string;
  coverage: string;
  total_accidents: number;
  date_min: string | null;
  date_max: string | null;
  regions_processed: number;
  regions: MetaRegion[];
  totals: { dead: number; injured: number };
}

export interface Dictionaries {
  cats: string[];
  sevs: string[];
  lights: string[];
  weathers: string[];
  roads: string[];
  brands: string[];
}

export interface YearRow { year: number; accidents: number; dead: number; injured: number }

export interface OverviewAgg {
  by_year: YearRow[];
  severity_totals: [number, number, number];
  categories: [string, number][];
  lights: [string, number][];
  weathers: [string, number][];
  roads: [string, number][];
}

export interface TemporalAgg {
  weekdays: string[];
  tods: string[];
  seasons: string[];
  hour_weekday: number[][];
  by_hour: number[];
  hour_severity: number[][];
  by_month: number[];
  years: number[];
  month_year: number[][];
  season_counts: Record<string, number>;
  tod_severity: number[][];
}

export interface VehiclesAgg {
  top_brands: { name: string; count: number; severe_share?: number }[];
  top_models: { brand: string; model: string; count: number }[];
  vehicle_categories: [string, number][];
  age_labels: string[];
  age_counts: number[];
}

export interface ExperienceStat {
  bucket: string; drivers: number; accidents: number;
  severe_share: number; night_share: number; avg_injured: number;
}

export interface ExperienceAgg {
  buckets: string[];
  baseline_severe_share: number;
  stats: ExperienceStat[];
}

export interface CulpritBrand { brand: string; culprit: number; victim: number; total: number; aggr: number }

export interface CulpritsAgg {
  methodology: string;
  totals: { accidents: number; with_vehicle_culprit: number; pedestrian_culprit: number };
  violations_top: [string, number][];
  brands: CulpritBrand[];
}

/** Строка модели внутри марки: [модель, всего ДТП, из них виновник] */
export type BrandModelRow = [string, number, number];

export interface BrandDetail {
  /** ДТП с участием марки (по определённой тяжести) */
  total: number;
  /** [лёгкие, тяжёлые, с погибшими] */
  sev: [number, number, number];
  /** водители этой марки с нарушением ПДД */
  culprit: number;
  /** водители этой марки без нарушений */
  victim: number;
  /** топ-нарушения водителей марки */
  violations: [string, number][];
  /** динамика по годам: [год, ДТП] */
  by_year: [string, number][];
  /** гео-охват: [регион, ДТП] — топ-12 + прочие */
  by_region: [string, number][];
  /** Доминирующий тип ТС. Появляется после пересборки данных. */
  cat?: string | null;
  /** Расклад по типам ТС, топ-5. */
  by_cat?: [string, number][];
}

export interface BrandsFile {
  generated_at_utc: string;
  brands: Record<string, BrandDetail>;
}

export interface National {
  overview: OverviewAgg;
  temporal: TemporalAgg;
  vehicles: VehiclesAgg;
  experience: ExperienceAgg;
  culprits: CulpritsAgg;
}

/** Геохэш-ячейка: [hash, легкие, тяжёлые, с погибшими, dead, injured] */
export type HeatCell = [string, number, number, number, number, number];

/** Строка регионального файла (16 значений):
 * [lat, lon, ym, dow(0=Пн), hour, sevIdx, catIdx, lightIdx, weatherIdx, roadIdx,
 *  expBucketIdx, firstVehBrandIdx, dead, inj, culpritBrandIdx, vehCount] */
export type PointRow = number[];

export interface RegionFile {
  slug: string;
  total: number;
  date_min: string | null;
  date_max: string | null;
  bbox: [number, number, number, number];
  rows: PointRow[];
}

export interface TipRule {
  id: string;
  scope: "time" | "season_time" | "weather" | "light" | "road" | "experience";
  /**
   * Условие правила — конъюнкция указанных ключей.
   * Раньше здесь стоял Record<string, unknown>, из-за чего опечатка в
   * имени ключа не ловилась ни компилятором, ни тестами.
   */
  when: {
    tod?: string;
    season?: string;
    weekday?: string;
    hour_from?: number;
    hour_to?: number;
    experience_bucket?: string;
    road_condition?: string;
    weather?: string;
    light?: string;
  };
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
