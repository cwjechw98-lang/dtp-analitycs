/**
 * Слой URL — единственный источник состояния, которое переживает
 * перезагрузку и пересылку в чат (контракт §2).
 *
 * Правила разбора:
 *  · неизвестный параметр игнорируется молча;
 *  · невалидное значение откатывается к дефолту без ошибки —
 *    ссылка из чужого чата не должна ломать приложение;
 *  · порядок параметров не значим.
 */

export const DEFAULT_BUFFER_M = 400;
export const BUFFER_MIN = 150;
export const BUFFER_MAX = 1500;

/** Бакеты стажа — порядок совпадает с national.experience.buckets */
export const EXP_BUCKETS = ["0–2", "3–5", "6–10", "11–15", "16–20", "21+"] as const;

/** Точка маршрута: "lat,lon" либо "lat,lon,подпись" */
export interface UrlPoint {
  lat: number;
  lon: number;
  label: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function parsePoint(raw: string | null): UrlPoint | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length < 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const label = parts.slice(2).join(",").trim();
  return { lat, lon, label: label || `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
}

export function serializePoint(p: UrlPoint): string {
  const head = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  return p.label ? `${head},${p.label}` : head;
}

export function parseBuffer(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_BUFFER_M;
  return clamp(Math.round(n / 50) * 50, BUFFER_MIN, BUFFER_MAX);
}

/** Индекс бакета стажа; null — «не указан» */
export function parseExp(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= EXP_BUCKETS.length) return null;
  return n;
}

/** Список неотрицательных индексов через запятую: "0,2,3" */
export function parseIndexList(raw: string | null, max: number): number[] {
  if (!raw) return [];
  const out = new Set<number>();
  for (const chunk of raw.split(",")) {
    const n = Number(chunk);
    if (Number.isInteger(n) && n >= 0 && n < max) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function serializeIndexList(xs: number[]): string | null {
  return xs.length ? [...xs].sort((a, b) => a - b).join(",") : null;
}

/**
 * Год или диапазон: "2024" | "2015-2026".
 * Возвращает [from, to]; null — весь доступный период.
 */
export function parseYears(raw: string | null, min: number, max: number): [number, number] | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) return null;
  const from = clamp(Number(m[1]), min, max);
  const to = m[2] ? clamp(Number(m[2]), min, max) : from;
  return from <= to ? [from, to] : [to, from];
}

export function serializeYears(range: [number, number] | null): string | null {
  if (!range) return null;
  return range[0] === range[1] ? String(range[0]) : `${range[0]}-${range[1]}`;
}

/** Слаг региона либо "ALL". Валидность слага проверяет вызывающий по meta.regions. */
export function parseScope(raw: string | null, known: Set<string>): string {
  if (!raw || raw === "ALL") return "ALL";
  return known.has(raw) ? raw : "ALL";
}

/** Марка: приходит в URL закодированной, сравнение регистронезависимое. */
export function parseBrand(raw: string | null, known: Map<string, string>): string | null {
  if (!raw) return null;
  return known.get(raw.trim().toUpperCase()) ?? null;
}

/** До двух марок для дуэли: ?vs=TOYOTA,KIA */
export function parseVs(raw: string | null, known: Map<string, string>): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const chunk of raw.split(",")) {
    const b = parseBrand(chunk, known);
    if (b && !out.includes(b)) out.push(b);
    if (out.length === 2) break;
  }
  return out;
}

/**
 * Собирает query-строку, выбрасывая пустые значения.
 * Нужен, чтобы ссылки оставались короткими и стабильными:
 * одно и то же состояние всегда даёт одну и ту же строку.
 */
export function buildSearch(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    if (v == null || v === "") continue;
    sp.set(key, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
