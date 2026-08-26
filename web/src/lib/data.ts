import { useEffect, useState } from "react";
import type {
  Experience, Meta, Overview, Points, Temporal, Tips, Vehicles,
} from "./types";

export interface Datasets {
  meta: Meta;
  overview: Overview;
  temporal: Temporal;
  vehicles: Vehicles;
  experience: Experience;
  tips: Tips;
  points: Points;
}

const BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Загружает все датасеты последовательно, отдаёт прогресс для экрана загрузки. */
export function useDatasets(): { data: Datasets | null; error: string | null; step: string } {
  const [data, setData] = useState<Datasets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState("Загрузка…");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStep("Сводка…");
        const meta = await getJson<Meta>("meta.json");
        setStep("Обзорная статистика…");
        const overview = await getJson<Overview>("overview.json");
        setStep("Временные профили…");
        const temporal = await getJson<Temporal>("temporal.json");
        setStep("Автомобили и водители…");
        const [vehicles, experience] = await Promise.all([
          getJson<Vehicles>("vehicles.json"),
          getJson<Experience>("experience.json"),
        ]);
        setStep("База советов…");
        const tips = await getJson<Tips>("tips.json");
        setStep(`Точки ДТП (${meta.total_accidents.toLocaleString("ru-RU")}) — самый большой файл…`);
        const points = await getJson<Points>("points.json");
        if (!alive) return;
        setData({ meta, overview, temporal, vehicles, experience, tips, points });
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { data, error, step };
}

/** Человеческая дата генерации данных из ISO-строки. */
export function humanDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export const SEV_COLORS = ["#38bdf8", "#f59e0b", "#ef4444"];
export const ACCENT = "#f97316";
