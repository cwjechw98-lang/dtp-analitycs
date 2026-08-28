import type { National, Meta } from "./types";

/**
 * Пул предвычисленных проверенных facts (Этап H2).
 * Каждый fact: claim, evidence, N, period, deep link (Research URL с фильтрами),
 * category. Детерминированные — считаются из national/overview агрегатов,
 * НЕ генерируются LLM на лету. При загрузке выбирается один.
 */

export interface ResearchFact {
  id: string;
  category: string;
  title: string;      // заголовок (claim)
  text: string;       // evidence
  n: number;
  period: string;
  deepLink: string;   // URL с фильтрами, открывающий Research View
}

export function buildFacts(national: National, meta: Meta): ResearchFact[] {
  const facts: ResearchFact[] = [];
  const y = national.overview.by_year;

  // 1. Транспорт: самая частая марка/категория
  const topBrand = national.vehicles.top_brands[0];
  if (topBrand) {
    facts.push({
      id: "brand-top", category: "транспорт",
      title: `«${topBrand.name}» — самая упоминаемая марка в ДТП`,
      text: `${topBrand.count.toLocaleString("ru-RU")} зарегистрированных ДТП с участием марки.`,
      n: topBrand.count, period: `${meta.date_min?.slice(0, 4)}–${meta.date_max?.slice(0, 4)}`,
      deepLink: `/fleet?brand=${encodeURIComponent(topBrand.name)}`,
    });
  }

  // 2. Время: самый массовый час суток
  const hour = national.temporal.by_hour;
  const peak = hour.indexOf(Math.max(...hour));
  if (peak >= 0) {
    facts.push({
      id: "hour-peak", category: "время",
      title: `Пик зарегистрированных ДТП — ${peak}:00`,
      text: `${hour[peak].toLocaleString("ru-RU")} ДТП приходится на ${peak} час.`,
      n: hour[peak], period: `${meta.date_min?.slice(0, 4)}–${meta.date_max?.slice(0, 4)}`,
      deepLink: `/atlas?v=1`,
    });
  }

  // 3. Сезон: лето/день (если есть в season_counts)
  const season = national.temporal.season_counts;
  const topSeason = season && Object.entries(season).sort((a, b) => b[1] - a[1])[0];
  if (topSeason) {
    facts.push({
      id: "season-peak", category: "сезон",
      title: `Пик — ${topSeason[0]}`,
      text: `${topSeason[1].toLocaleString("ru-RU")} ДТП в сезон «${topSeason[0]}».`,
      n: topSeason[1], period: `${meta.date_min?.slice(0, 4)}–${meta.date_max?.slice(0, 4)}`,
      deepLink: `/atlas?v=1`,
    });
  }

  // 4. Категория ДТП: самая массовая
  const topCat = national.overview.categories[0];
  if (topCat) {
    facts.push({
      id: "cat-top", category: "происшествие",
      title: `«${topCat[0]}» — самый частый вид ДТП`,
      text: `${topCat[1].toLocaleString("ru-RU")} зарегистрированных случаев.`,
      n: topCat[1], period: `${meta.date_min?.slice(0, 4)}–${meta.date_max?.slice(0, 4)}`,
      deepLink: `/atlas?v=1`,
    });
  }

  // 5. Погода: ясно — массовое условие
  const topWeather = national.overview.weathers[0];
  if (topWeather) {
    facts.push({
      id: "weather-top", category: "погода",
      title: `Чаще всего ДТП при погоде «${topWeather[0]}»`,
      text: `${topWeather[1].toLocaleString("ru-RU")} зарегистрированных случаев.`,
      n: topWeather[1], period: `${meta.date_min?.slice(0, 4)}–${meta.date_max?.slice(0, 4)}`,
      deepLink: `/atlas?v=1`,
    });
  }

  // 6. Исход: тяжёлые/погибшие доля
  const sev = national.overview.severity_totals; // [light, heavy, fatal]
  const fatal = sev[2] ?? 0;
  if (fatal > 0) {
    facts.push({
      id: "fatal", category: "человеческий исход",
      title: `${fatal.toLocaleString("ru-RU")} ДТП закончились гибелью`,
      text: `${(fatal / Math.max(1, sev[0] + sev[1] + sev[2]) * 100).toFixed(1)}% от всех зарегистрированных.`,
      n: fatal, period: `${meta.date_min?.slice(0, 4)}–${meta.date_max?.slice(0, 4)}`,
      deepLink: `/atlas?v=1&sev=fatal`,
    });
  }

  return facts;
}

/** Выбор одного факта (детерминированный по дню). */
export function pickFact(facts: ResearchFact[]): ResearchFact | null {
  if (!facts.length) return null;
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return facts[dayIndex % facts.length];
}
