import { useEffect, useMemo, useState } from "react";
import { Badge, Card } from "./ui";
import { EXP_BUCKETS } from "../lib/urlState";
import { bestHours, matchRules, todOfHour, tripContextFromDate } from "../lib/tips";
import { fetchCurrentWeather, type CurrentWeather } from "../lib/weather";
import { useApp } from "../state/AppState";
import { useProfile } from "../state/ProfileContext";

/**
 * Правила риска для конкретной поездки (контракт §5, этап 2).
 *
 * Раньше это был отдельный раздел «Советы» с собственными селекторами стажа
 * и сезона — то есть человек заново отвечал на вопросы, ответы на которые
 * уже лежали в профиле, и получал список правил в отрыве от маршрута.
 *
 * Теперь правило показывается там, где применимо: рядом с отчётом по
 * коридору, с учётом стажа из профиля и выбранного часа выезда.
 */
export default function RouteTips({
  origin,
  roadConditions,
  expOverride,
}: {
  /** точка А — от неё считаем погоду: важно, откуда ты выезжаешь */
  origin: { lat: number; lon: number; label: string } | null;
  /** покрытия, реально встреченные в коридоре маршрута */
  roadConditions?: string[];
  /** стаж из URL, если он перекрывает профиль */
  expOverride?: number | null;
}) {
  const app = useApp();
  const { profile } = useProfile();
  const [hour, setHour] = useState(() => new Date().getHours());
  const [weather, setWeather] = useState<CurrentWeather | null>(null);

  const expIdx = expOverride ?? profile.exp;
  const expBucket = expIdx == null ? null : EXP_BUCKETS[expIdx];

  useEffect(() => {
    if (!origin) return;
    let alive = true;
    fetchCurrentWeather(origin.lat, origin.lon, app.national.overview.weathers)
      .then((w) => alive && setWeather(w))
      .catch(() => alive && setWeather(null));
    return () => {
      alive = false;
    };
  }, [origin, app.national.overview.weathers]);

  const ctx = useMemo(() => {
    const base = tripContextFromDate(new Date(), expBucket);
    return { ...base, hour, tod: todOfHour(hour), roadConditions };
  }, [expBucket, hour, roadConditions]);

  const { risky, calm } = useMemo(() => matchRules(app.tips.rules, ctx), [app.tips.rules, ctx]);
  const better = useMemo(() => bestHours(app.tips.rules, ctx, 3), [app.tips.rules, ctx]);

  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <Card
      title="Что говорит статистика про этот выезд"
      subtitle={
        expBucket
          ? `Стаж ${expBucket} лет · ${ctx.season.toLowerCase()} · ${ctx.tod.toLowerCase()}`
          : `${ctx.season} · ${ctx.tod.toLowerCase()} · укажи стаж в профиле, чтобы добавить правила по опыту`
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Час выезда
          <input
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="w-40 accent-orange-500"
          />
          <b className="w-12 text-slate-200">{hh(hour)}</b>
        </label>

        {weather && origin && (
          <span className="text-xs text-slate-400">
            {origin.label.split(",")[0]} сейчас: <b className="text-slate-200">{Math.round(weather.tempC)}°C</b>,{" "}
            {weather.label.toLowerCase()}, ветер {Math.round(weather.windMs)} м/с
          </span>
        )}
      </div>

      {risky.length === 0 && calm.length === 0 && (
        <p className="text-sm text-slate-400">
          Для этого сочетания условий правил с достаточной выборкой нет. Это не значит, что риска
          нет — значит, статистика не выделяет его как повышенный.
        </p>
      )}

      {risky.length > 0 && (
        <div className="space-y-2">
          {risky.map((r) => (
            <div key={r.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-white">{r.title}</h4>
                <Badge tone="red">×{r.lift.toFixed(2)}</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{r.text}</p>
              <p className="mt-1 text-[10px] text-slate-500">выборка n = {r.n.toLocaleString("ru-RU")}</p>
            </div>
          ))}
        </div>
      )}

      {calm.length > 0 && (
        <div className="mt-2 space-y-2">
          {calm.map((r) => (
            <div key={r.id} className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-white">{r.title}</h4>
                <Badge tone="blue">×{r.lift.toFixed(2)}</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{r.text}</p>
              <p className="mt-1 text-[10px] text-slate-500">выборка n = {r.n.toLocaleString("ru-RU")}</p>
            </div>
          ))}
        </div>
      )}

      {better.length > 0 && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Часы с наименьшим подъёмом риска
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {better.map((b) => (
              <button
                key={b.hour}
                onClick={() => setHour(b.hour)}
                className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200 transition hover:border-slate-500"
              >
                {hh(b.hour)} · ×{b.score.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-snug text-slate-600">
        Правило публикуется при выборке от {app.tips.thresholds.min_n[1]} случаев и отклонении от
        ×{app.tips.thresholds.lift_min} к базовой частоте. Частоты не нормированы на пробег: это
        сравнение долей внутри выборки, а не измерение вероятности попасть в ДТП.
      </p>
    </Card>
  );
}
