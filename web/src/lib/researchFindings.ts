import type { Dictionaries, PointRow } from "./types";
import { COL } from "./derive";

/**
 * Findings Engine v2 (Этап E) — работает поверх фильтрованного среза (Research).
 * Использует claim types вместо глобального правила N>=30: у каждого типа свои
 * минимальное доказательство, baseline, абсолютный/относительный эффект и
 * правило уверенности. Всегда различает «концентрацию зарегистрированных ДТП»
 * и «риск попасть в ДТП» (у нас нет exposure denominator).
 */

export type ClaimType =
  | "share_difference"
  | "severity_difference"
  | "temporal_change"
  | "category_overrepresentation"
  | "spatial_concentration";

export interface ResearchFinding {
  id: string;
  type: ClaimType;
  /** готовая формулировка (шаблон из чисел) */
  text: string;
  /** доказательная часть: пары «подпись → значение» */
  evidence: [string, string][];
  /** абсолютный эффект (например п.п.) */
  effectAbs?: number;
  /** относительный эффект (например x1.4) */
  effectRel?: number;
  /** выборка */
  n: number;
  /** уверенность: probability-like 0..1 (оценка по правилу, не p-value) */
  confidence: number;
  /** предупреждает или успокаивает */
  warns: boolean;
}

// ---- пороги (по типу claim) ----
const MIN_N = 30;              // минимальная абсолютная выборка среза
const MIN_BASELINE_N = 200;    // минимум для базовой доли
const MIN_REL = 1.2;           // относительный эффект (или 1/1.2)
const MIN_PP = 0.03;           // абсолютный эффект в долях (3 п.п.)

function pctShare(rows: PointRow[], idx: number, val: number): number {
  if (!rows.length) return 0;
  let c = 0;
  for (const r of rows) if (r[idx] === val) c++;
  return c / rows.length;
}

/** Сравнивает долю подмножества в срезе с долей в базе (все ДТП) — share_difference. */
function shareDifference(slice: PointRow[], base: PointRow[], label: string, idx: number, val: number): ResearchFinding | null {
  const sn = slice.length;
  if (sn < MIN_N || base.length < MIN_BASELINE_N) return null;
  const sShare = pctShare(slice, idx, val);
  const bShare = pctShare(base, idx, val);
  if (bShare === 0) return null;
  const rel = sShare / bShare;
  if (rel < MIN_REL && rel > 1 / MIN_REL) return null;
  const pp = sShare - bShare;
  if (Math.abs(pp) < MIN_PP) return null;
  const warns = pp > 0;
  const text = warns
    ? `Среди ДТП этого среза доля «${label}» составляет ${(sShare * 100).toFixed(0)}% против ${(bShare * 100).toFixed(0)}% в общем наборе.`
    : `Среди ДТП этого среза доля «${label}» ниже — ${(sShare * 100).toFixed(0)}% против ${(bShare * 100).toFixed(0)}% в общем наборе.`;
  return {
    id: `share-${idx}-${val}`, type: "share_difference", text,
    evidence: [["в срезе", `${(sShare * 100).toFixed(0)}%`], ["в базе", `${(bShare * 100).toFixed(0)}%`]],
    effectAbs: Math.abs(pp), effectRel: rel, n: sn,
    confidence: Math.min(1, 0.5 + Math.abs(pp) * 6),
    warns,
  };
}

/** Тяжесть (доля тяжёлых+погибших) в срезе против базы. */
function severityDifference(slice: PointRow[], base: PointRow[]): ResearchFinding | null {
  const sn = slice.length;
  if (sn < MIN_N || base.length < MIN_BASELINE_N) return null;
  const sSev = (pctShare(slice, COL.SEV, 1) + pctShare(slice, COL.SEV, 2));
  const bSev = (pctShare(base, COL.SEV, 1) + pctShare(base, COL.SEV, 2));
  const pp = sSev - bSev;
  if (Math.abs(pp) < MIN_PP) return null;
  const warns = pp > 0;
  const text = warns
    ? `Доля тяжёлых исходов в этом срезе ${(sSev * 100).toFixed(0)}% против ${(bSev * 100).toFixed(0)}% в общем наборе.`
    : `Доля тяжёлых исходов в этом срезе ниже — ${(sSev * 100).toFixed(0)}% против ${(bSev * 100).toFixed(0)}% в общем наборе.`;
  return {
    id: "severity", type: "severity_difference", text,
    evidence: [["в срезе", `${(sSev * 100).toFixed(0)}%`], ["в базе", `${(bSev * 100).toFixed(0)}%`]],
    effectAbs: Math.abs(pp), n: sn, confidence: Math.min(1, 0.5 + Math.abs(pp) * 6), warns,
  };
}

/** Динамика по годам: последний полный год против предыдущего (или первого). */
function temporalChange(slice: PointRow[]): ResearchFinding | null {
  const byYear = new Map<number, number>();
  for (const r of slice) {
    const y = Math.floor(r[COL.YM] / 100);
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length < 2) return null;
  const last = years[years.length - 1];
  const prev = years[years.length - 2];
  // если последний год неполный (2026) — сравниваем предпоследний с позапрошлым
  let li = years.length - 1;
  if (last === 2026 && years.length >= 3) li = years.length - 2;
  const a = byYear.get(years[li]) ?? 0;
  const b = byYear.get(years[li - 1]) ?? 0;
  if (b === 0 || a < MIN_N) return null;
  const rel = a / b;
  if (Math.abs(rel - 1) < 0.1) return null;
  const warns = rel > 1;
  const text = warns
    ? `Число ДТП в срезе выросло с ${years[li - 1]} по ${years[li]}: ${b.toLocaleString("ru-RU")} → ${a.toLocaleString("ru-RU")}.`
    : `Число ДТП в срезе снизилось с ${years[li - 1]} по ${years[li]}: ${b.toLocaleString("ru-RU")} → ${a.toLocaleString("ru-RU")}.`;
  return {
    id: "temporal", type: "temporal_change", text,
    evidence: [[String(years[li - 1]), b.toLocaleString("ru-RU")], [String(years[li]), a.toLocaleString("ru-RU")]],
    effectRel: rel, n: a, confidence: Math.min(1, 0.5 + Math.abs(rel - 1) * 1.5), warns,
  };
}

/** Преобладание категории ДТП в срезе против базы. */
function categoryOverrepresentation(slice: PointRow[], base: PointRow[], d: Dictionaries): ResearchFinding | null {
  const sn = slice.length;
  if (sn < MIN_N || base.length < MIN_BASELINE_N) return null;
  const sCats = new Map<number, number>();
  const bCats = new Map<number, number>();
  for (const r of slice) sCats.set(r[COL.CAT], (sCats.get(r[COL.CAT]) ?? 0) + 1);
  for (const r of base) bCats.set(r[COL.CAT], (bCats.get(r[COL.CAT]) ?? 0) + 1);
  let best: { cat: number; rel: number; n: number } | null = null;
  for (const [cat, c] of sCats) {
    const b = bCats.get(cat) ?? 0;
    if (b < MIN_N) continue;
    const rel = (c / sn) / (b / base.length);
    if (rel >= MIN_REL && (!best || rel > best.rel)) best = { cat, rel, n: c };
  }
  if (!best) return null;
  const name = d.cats[best.cat] ?? "—";
  const text = `В этом срезе «${name}» встречается в ${best.rel.toFixed(1)}× чаще, чем в общем наборе.`;
  return {
    id: `cat-${best.cat}`, type: "category_overrepresentation", text,
    evidence: [["в срезе", best.n.toLocaleString("ru-RU")], ["частота", `${best.rel.toFixed(1)}×`]],
    effectRel: best.rel, n: best.n, confidence: Math.min(1, 0.5 + (best.rel - 1)), warns: true,
  };
}

/** Концентрация по местным районам (top vs остальные). */
function spatialConcentration(slice: PointRow[], d: Dictionaries): ResearchFinding | null {
  const sn = slice.length;
  if (sn < MIN_N) return null;
  const byLocal = new Map<number, number>();
  for (const r of slice) {
    const li = r[COL.LOCAL_REGION] ?? -1;
    if (li >= 0) byLocal.set(li, (byLocal.get(li) ?? 0) + 1);
  }
  if (!byLocal.size) return null;
  let top: [number, number] | null = null;
  for (const [li, c] of byLocal) if (!top || c > top[1]) top = [li, c];
  if (!top || top[1] < MIN_N) return null;
  const share = top[1] / sn;
  if (share < 0.2) return null;
  const text = `Наибольшая доля ДТП среза сосредоточена в одном районе — ${(share * 100).toFixed(0)}% (${top[1].toLocaleString("ru-RU")} из ${sn.toLocaleString("ru-RU")}).`;
  return {
    id: "spatial", type: "spatial_concentration", text,
    evidence: [["ДТП", top[1].toLocaleString("ru-RU")], ["доля", `${(share * 100).toFixed(0)}%`]],
    effectAbs: share, n: top[1], confidence: Math.min(1, 0.5 + (share - 0.2)), warns: true,
  };
}

/** Запускает всех claim-продюсеров по срезу и базе. */
export function runResearchFindings(slice: PointRow[], base: PointRow[], d: Dictionaries): ResearchFinding[] {
  const out: ResearchFinding[] = [];
  const push = (f: ResearchFinding | null) => { if (f) out.push(f); };
  push(severityDifference(slice, base));
  push(temporalChange(slice));
  push(categoryOverrepresentation(slice, base, d));
  push(spatialConcentration(slice, d));
  // share_difference для нескольких запоминающихся подмножеств
  push(shareDifference(slice, base, "пешеходы", COL.PART_TYPES, 2));      // pedestrian
  push(shareDifference(slice, base, "погибшие/тяжёлые", COL.SEV, 2));      // fatal
  // сортировка: сначала предупреждающие и сильные
  return out.sort((a, b) => Number(b.warns) - Number(a.warns) || b.confidence - a.confidence);
}
