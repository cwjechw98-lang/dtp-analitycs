import type { PointRow, Dictionaries } from "./types";
import { COL } from "./derive";

/**
 * Guard: битмаски в frontend хранятся в JS number (32-битные bitwise через Int32).
 * Чтобы не допустить тихий overflow при расширении Semantic Contract v1,
 * число канонических значений каждого атрибута не должно превышать MAX_BITS.
 */
export const MAX_SEMANTIC_BITS = 31;

function assertBits(count: number, attr: string): void {
  if (count >= MAX_SEMANTIC_BITS) {
    throw new Error(
      `Semantic Contract overflow: '${attr}' имеет ${count} значений, но поддерживается < ${MAX_SEMANTIC_BITS} для JS bitmask. Необходимо безопасное представление.`
    );
  }
}

/** Проверяет словарь на overflow — вызывается при загрузке контракта. */
export function assertSemanticMasksSafe(d: Dictionaries): void {
  assertBits(d.veh_supers.length, "veh_supers");
  assertBits(d.part_types.length, "part_types");
  assertBits(d.outcome_groups.length, "outcome_groups");
  assertBits(d.infra_facets.length, "infra_facets");
}

/**
 * Research-фильтр (Этап B). В Phase 1A — только предикат поверх semantic-блока
 * строки региона. Марки записываются в 16-ю и далее позиции как битмаски.
 */
export interface ResearchFilter {
  /** индексы суперкатегорий ТС (dicionarios.veh_supers) */
  vehSupers?: number[];
  /** индексы типов участников (dictionaries.part_types) */
  partTypes?: number[];
  /** индексы групп исхода (dictionaries.outcome_groups) */
  outcomes?: number[];
  /** индексы инфраструктурных фасетов (dictionaries.infra_facets) */
  infra?: number[];
  /** индексы тяжести (0 лёгкий, 1 тяжёлый, 2 с погибшими) */
  severities?: number[];
  /** годы [min, max] включительно, по YM (year*100+month) */
  yearMin?: number;
  yearMax?: number;
}

function maskMatch(mask: number, wanted?: number[]): boolean {
  if (!wanted || wanted.length === 0) return true;
  // ДТП подходит, если есть ХОТЯ БЫ ОДНО совпадение с любым из искомых значений
  for (const idx of wanted) {
    if (mask & (1 << idx)) return true;
  }
  return false;
}

/** Проверяет, проходит ли строка региона через фильтр. */
export function rowPasses(r: PointRow, f: ResearchFilter): boolean {
  if (f.vehSupers && f.vehSupers.length && !maskMatch(r[COL.VEH_SUPERS] ?? 0, f.vehSupers)) return false;
  if (f.partTypes && f.partTypes.length && !maskMatch(r[COL.PART_TYPES] ?? 0, f.partTypes)) return false;
  if (f.outcomes && f.outcomes.length && !maskMatch(r[COL.OUTCOMES] ?? 0, f.outcomes)) return false;
  if (f.infra && f.infra.length && !maskMatch(r[COL.INFRA] ?? 0, f.infra)) return false;
  if (f.severities && f.severities.length && !f.severities.includes(r[COL.SEV])) return false;
  if (f.yearMin !== undefined || f.yearMax !== undefined) {
    const year = Math.floor(r[COL.YM] / 100);
    if (f.yearMin !== undefined && year < f.yearMin) return false;
    if (f.yearMax !== undefined && year > f.yearMax) return false;
  }
  return true;
}

/** Стабильные короткие URL-коды для semantic-атрибутов (см. B4 плана). */
const URL_CODES: Record<string, Record<string, string>> = {
  veh_supers: {
    car: "passenger_car", truck: "truck", bus: "bus", moto: "motorcycle",
    bike: "bicycle", sim: "personal_mobility", spec: "special_vehicle",
    trailer: "trailer", rail: "rail_vehicle", other: "other",
  },
  part_types: {
    driver: "driver", passenger: "passenger", pedestrian: "pedestrian",
    cyclist: "cyclist", moto: "motorcyclist", road: "road_worker",
    police: "traffic_police", safety: "public_safety_worker", other: "other",
  },
  outcome_groups: {
    ok: "not_injured", outpatient: "outpatient", minor: "minor_injury",
    hospital: "hospitalized", scene: "fatal_on_scene", transport: "fatal_transport",
    later: "fatal_afterwards",
  },
  infra_facets: {
    intersection: "intersection", crossing: "pedestrian_crossing",
    transport: "public_transport", railway: "railway", bridge: "bridge_tunnel",
    service: "roadside_service", school: "education_children", residential: "residential",
    none: "none", road: "road_context", poi: "poi_other",
  },
};

function vIdx(code: string, dictArr: string[] | undefined, dictName: keyof typeof URL_CODES): number[] | undefined {
  if (!dictArr) return undefined;
  const out: number[] = [];
  const codes = URL_CODES[dictName];
  for (const tok of code.split(",")) {
    const canonical = codes[tok] ?? tok; // допускаем и прямое каноническое имя
    const i = dictArr.indexOf(canonical);
    if (i >= 0) out.push(i);
  }
  return out.length ? out : undefined;
}

/**
 * Стабильный persistent-ключ местного района для URL/share state.
 * НЕ зависит от внутреннего localRegionIdx (который — только быстрый индекс
 * внутри загруженного region file и не для URL). Ключ = субъект + нормализованное
 * название района, поэтому одинаковые названия в разных субъектах не смешиваются.
 */
export function localRegionKey(subjectId: string, rawName: string): string {
  const norm = rawName.trim().replace(/\s+/g, " ").toLowerCase();
  return `${subjectId}|${norm}`;
}

/** Строит persistent-ключ для URL: краткий код из URL_CODES, иначе канон. имя. */
export function urlCodeForValue(dictName: keyof typeof URL_CODES, canonical: string): string {
  const codes = URL_CODES[dictName];
  for (const [short, name] of Object.entries(codes)) if (name === canonical) return short;
  return canonical;
}

/**
 * Фильтр из строки URL (?v=1&y=2021-2025&sev=fatal,heavy&veh=car,moto&part=...&out=...&inf=...).
 * Использует стабильные короткие коды -> канонические имена из словаря.
 */
export function filterFromUrl(url: URL, d: Dictionaries): ResearchFilter {
  const f: ResearchFilter = {};

  const y = url.searchParams.get("y");
  if (y) {
    const m = /^(\d{4})-(\d{4})$/.exec(y);
    if (m) { f.yearMin = +m[1]; f.yearMax = +m[2]; }
    else if (/^\d{4}$/.test(y)) { f.yearMin = f.yearMax = +y; }
  }

  const sev = url.searchParams.get("sev");
  if (sev) {
    const map: Record<string, number> = { fatal: 2, heavy: 1, light: 0 };
    f.severities = sev.split(",").map((s) => map[s]).filter((n): n is number => n !== undefined);
  }

  const veh = url.searchParams.get("veh");
  if (veh) f.vehSupers = vIdx(veh, d.veh_supers, "veh_supers");
  const part = url.searchParams.get("part");
  if (part) f.partTypes = vIdx(part, d.part_types, "part_types");
  const out = url.searchParams.get("out");
  if (out) f.outcomes = vIdx(out, d.outcome_groups, "outcome_groups");
  const inf = url.searchParams.get("inf");
  if (inf) f.infra = vIdx(inf, d.infra_facets, "infra_facets");

  return f;
}

