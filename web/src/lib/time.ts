export const TOD_NAMES = ["Ночь", "Утро", "День", "Вечер"] as const;
export const SEASON_NAMES = ["Зима", "Весна", "Лето", "Осень"] as const;

/** Время суток по часу: Ночь 23–06 · Утро 06–12 · День 12–18 · Вечер 18–23 */
export function todOf(hour: number): number {
  if (hour >= 23 || hour < 6) return 0;
  if (hour < 12) return 1;
  if (hour < 18) return 2;
  return 3;
}

/** Сезон по месяцу (1–12): 0 Зима, 1 Весна, 2 Лето, 3 Осень */
export function seasonOfMonth(month1to12: number): number {
  return month1to12 === 12 || month1to12 <= 2 ? 0 : month1to12 <= 5 ? 1 : month1to12 <= 8 ? 2 : 3;
}

/** Сезон по yyyymm */
export function seasonOfYm(ym: number): number {
  return seasonOfMonth(ym % 100);
}
