import { useEffect, useRef, useState } from "react";
import type { GeoResult } from "../lib/osrm";

/**
 * Подсказки городов по мере ввода.
 *
 * Nominatim просит не чаще одного запроса в секунду, поэтому здесь два
 * механизма сразу:
 *  · debounce — запрос уходит только после паузы в наборе;
 *  · нижняя граница интервала — даже при рваном наборе между реальными
 *    запросами не меньше MIN_INTERVAL.
 *
 * Плюс отмена предыдущего запроса: ответ на устаревший ввод не должен
 * перетирать свежий список.
 *
 * В отличие от geocode() из osrm.ts, здесь одна попытка без запасного
 * «, Россия» — тот вариант ждёт 1.1 с между попытками и для набора
 * по буквам не годится.
 */

const DEBOUNCE_MS = 350;
const MIN_INTERVAL_MS = 1100;
const MIN_CHARS = 3;

export function usePlaceSuggest(query: string) {
  const [items, setItems] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchAt = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      abortRef.current?.abort();
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const sinceLast = Date.now() - lastFetchAt.current;
    const wait = Math.max(DEBOUNCE_MS, MIN_INTERVAL_MS - sinceLast);

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      lastFetchAt.current = Date.now();
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6" +
          "&accept-language=ru&countrycodes=ru&q=" +
          encodeURIComponent(q);
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { display_name: string; lat: string; lon: string }[];
        if (ctrl.signal.aborted) return;
        setItems(json.map((r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon) })));
      } catch (e) {
        // Отмена — это норма, а не ошибка: просто пришёл новый ввод.
        if ((e as Error)?.name !== "AbortError") setItems([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, wait);

    return () => clearTimeout(timer);
  }, [query]);

  return { items, loading };
}

/** Короткая подпись вместо полного display_name Nominatim. */
export function shortPlace(name: string): string {
  return name.split(",").slice(0, 3).join(",").trim();
}
