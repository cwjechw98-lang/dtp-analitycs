import type { OverviewAgg } from "./types";

export interface CurrentWeather {
  tempC: number;
  windMs: number;
  label: string; // человекочитаемое описание
  matchWeather: string | null; // ближайший класс из датасета
}

// Коды WMO из Open-Meteo current_weather.weathercode
function wmoLabel(code: number): { label: string; cls: string } {
  if ([0].includes(code)) return { label: "Ясно", cls: "Ясно" };
  if ([1, 2].includes(code)) return { label: "Малооблачно", cls: "Ясно" };
  if ([3].includes(code)) return { label: "Пасмурно", cls: "Пасмурно" };
  if ([45, 48].includes(code)) return { label: "Туман", cls: "Туман" };
  if ([51, 53, 55, 56, 57, 61, 63, 80, 81].includes(code))
    return { label: "Дождь", cls: "Дождь" };
  if ([65, 82, 95, 96, 99].includes(code)) return { label: "Сильный дождь/гроза", cls: "Дождь" };
  if ([66, 67].includes(code)) return { label: "Ледяной дождь", cls: "Гололедица" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Снегопад", cls: "Снегопад" };
  return { label: "Переменная облачность", cls: "Пасмурно" };
}

/** Сопоставляет класс Open-Meteo с реальными значениями поля weather датасета. */
function bestMatch(cls: string, weathers: OverviewAgg["weathers"]): string | null {
  const names = weathers.map((w) => w[0]);
  const direct = names.find((n) => n.toLowerCase() === cls.toLowerCase());
  if (direct) return direct;
  const lower = cls.toLowerCase();
  const partial = names.find((n) => n.toLowerCase().includes(lower.slice(0, 4)));
  if (partial) return partial;
  if (cls === "Гололедица") return names.find((n) => n.includes("скользк")) ?? null;
  return null;
}

/**
 * Текущая погода в произвольной точке через открытый Open-Meteo (без ключа).
 *
 * Раньше координаты Омска были зашиты в код — наследство от первой версии,
 * когда весь проект был только про Омскую область.
 */
export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  weathers: OverviewAgg["weathers"],
): Promise<CurrentWeather> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current_weather=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);
  const j = await res.json();
  const cw = j.current_weather;
  const w = wmoLabel(cw.weathercode);
  return {
    tempC: cw.temperature,
    windMs: cw.windspeed,
    label: w.label,
    matchWeather: bestMatch(w.cls, weathers),
  };
}
