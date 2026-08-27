import type { MetaRegion, Tips } from "./types";

type Rule = Tips["rules"][number];

export const TODS = ["Ночь", "Утро", "День", "Вечер"] as const;
export const SEASONS = ["Зима", "Весна", "Лето", "Осень"] as const;
export const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

/** Контекст поездки, против которого проверяются правила. */
export interface TripContext {
  /** час выезда 0…23 */
  hour: number;
  weekday: string;
  season: string;
  tod: string;
  /** бакет стажа как строка ("0–2"), null — стаж не указан */
  experienceBucket: string | null;
  /** покрытия, реально встречающиеся в коридоре маршрута */
  roadConditions?: string[];
}

/** Границы времени суток совпадают с пайплайном: Ночь 23–06, Утро 06–12, День 12–18, Вечер 18–23. */
export function todOfHour(hour: number): string {
  if (hour >= 23 || hour < 6) return "Ночь";
  if (hour < 12) return "Утро";
  if (hour < 18) return "День";
  return "Вечер";
}

export function seasonOfMonth(month1to12: number): string {
  if (month1to12 === 12 || month1to12 <= 2) return "Зима";
  if (month1to12 <= 5) return "Весна";
  if (month1to12 <= 8) return "Лето";
  return "Осень";
}

export function tripContextFromDate(d: Date, experienceBucket: string | null): TripContext {
  return {
    hour: d.getHours(),
    weekday: WEEKDAYS[d.getDay()],
    season: seasonOfMonth(d.getMonth() + 1),
    tod: todOfHour(d.getHours()),
    experienceBucket,
  };
}

/**
 * Проверяет одно правило против контекста.
 *
 * Условие в `when` — конъюнкция: все указанные ключи должны совпасть.
 * Ключ, которого в правиле нет, не ограничивает ничего.
 * Если контекст не может ответить на ключ (стаж не указан, покрытия
 * неизвестны) — правило не показываем: лучше промолчать, чем соврать.
 */
export function ruleMatches(rule: Rule, ctx: TripContext): boolean {
  const w = rule.when;

  if (w.tod !== undefined && w.tod !== ctx.tod) return false;
  if (w.season !== undefined && w.season !== ctx.season) return false;
  if (w.weekday !== undefined && w.weekday !== ctx.weekday) return false;

  if (w.hour_from !== undefined && w.hour_to !== undefined) {
    const { hour_from: from, hour_to: to } = w;
    // Диапазон может пересекать полночь (например 22→04).
    const inRange = from <= to ? ctx.hour >= from && ctx.hour <= to : ctx.hour >= from || ctx.hour <= to;
    if (!inRange) return false;
  }

  if (w.experience_bucket !== undefined) {
    if (ctx.experienceBucket == null) return false;
    if (w.experience_bucket !== ctx.experienceBucket) return false;
  }

  if (w.road_condition !== undefined) {
    if (!ctx.roadConditions?.length) return false;
    if (!ctx.roadConditions.includes(w.road_condition)) return false;
  }

  return true;
}

/**
 * Правила, применимые к поездке, отсортированные по силе эффекта.
 *
 * Повышающие риск (lift > 1) идут первыми и по убыванию — это то, ради чего
 * человек сюда пришёл. Понижающие (lift < 1) следом, тоже по силе: они
 * отвечают на вопрос «а когда лучше».
 */
export function matchRules(rules: Rule[], ctx: TripContext): { risky: Rule[]; calm: Rule[] } {
  const hit = rules.filter((r) => ruleMatches(r, ctx));
  return {
    risky: hit.filter((r) => r.lift > 1).sort((a, b) => b.lift - a.lift),
    calm: hit.filter((r) => r.lift <= 1).sort((a, b) => a.lift - b.lift),
  };
}

/**
 * Лучший час выезда среди ближайших: перебираем сутки вперёд и выбираем час
 * с наименьшим суммарным подъёмом риска.
 *
 * Считаем произведение lift применимых правил, а не сумму: правила
 * мультипликативны по построению (каждое — отношение к базовой частоте).
 */
export function bestHours(rules: Rule[], ctx: TripContext, count = 3): { hour: number; score: number }[] {
  const scored: { hour: number; score: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const at = { ...ctx, hour: h, tod: todOfHour(h) };
    const score = rules.filter((r) => ruleMatches(r, at)).reduce((acc, r) => acc * r.lift, 1);
    scored.push({ hour: h, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, count);
}

/** Центр региона по bbox — для запроса погоды и подписей. */
export function regionCenter(r: MetaRegion): { lat: number; lon: number } {
  const [latMin, latMax, lonMin, lonMax] = r.bbox;
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

/** Регион, в bbox которого попадает точка. Ближайший по площади, если их несколько. */
export function regionByPoint(regions: MetaRegion[], lat: number, lon: number): MetaRegion | null {
  const hits = regions.filter(
    (r) => lat >= r.bbox[0] && lat <= r.bbox[1] && lon >= r.bbox[2] && lon <= r.bbox[3],
  );
  if (!hits.length) return null;
  // bbox регионов перекрываются, поэтому берём самый компактный —
  // он почти всегда и есть настоящий.
  return hits.sort((a, b) => {
    const area = (r: MetaRegion) => (r.bbox[1] - r.bbox[0]) * (r.bbox[3] - r.bbox[2]);
    return area(a) - area(b);
  })[0];
}
