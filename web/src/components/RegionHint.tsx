import { useEffect, useState } from "react";
import { regionByPoint } from "../lib/tips";
import { useApp } from "../state/AppState";
import { useProfile } from "../state/ProfileContext";

/**
 * Подсказка «похоже, вы вот отсюда» (этап 2).
 *
 * Сознательно НЕ переключает регион само. Определение по IP в России часто
 * промахивается — многие провайдеры резолвятся в Москву, и человек из Омска
 * увидел бы московскую статистику, не понимая откуда. Поэтому предлагаем,
 * а решает пользователь: один клик — и регион уезжает в профиль насовсем.
 *
 * Источник координат — эндпоинт воркера /api/geo (этап 3). Пока его нет,
 * запрос молча падает и плашка просто не появляется: на зеркале GitHub
 * Pages и в локальной разработке это штатное поведение, а не ошибка.
 */

const DISMISS_KEY = "dtp.regionHint.dismissed";

export default function RegionHint() {
  const app = useApp();
  const { profile, set } = useProfile();
  const [guess, setGuess] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    // Регион уже выбран или подсказку однажды закрыли — не мозолим глаза.
    if (profile.region) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* приватный режим — просто продолжаем */
    }

    const ctrl = new AbortController();
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/geo`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { lat?: number; lon?: number }) => {
        if (typeof j.lat !== "number" || typeof j.lon !== "number") return;
        const region = regionByPoint(app.meta.regions, j.lat, j.lon);
        if (region) setGuess({ slug: region.slug, name: region.name });
      })
      .catch(() => {
        /* эндпоинта нет или не отдал координаты — тихо ничего не показываем */
      });

    return () => ctrl.abort();
  }, [app.meta.regions, profile.region]);

  if (!guess) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* не критично */
    }
    setGuess(null);
  };

  return (
    <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 px-4 py-2.5">
      <span className="text-xs text-slate-300">
        Похоже, вы в регионе «{guess.name}». Показать статистику по нему?
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            set({ region: guess.slug });
            app.setScope(guess.slug);
            setGuess(null);
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Да, открыть
        </button>
        <button
          onClick={dismiss}
          className="rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition hover:text-slate-200"
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
