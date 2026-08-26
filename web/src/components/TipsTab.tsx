import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/AppState";
import { Badge, Card } from "./ui";
import { fetchCurrentOmsk, type CurrentWeather } from "../lib/weather";

export default function TipsTab() {
  const app = useApp();
  const tipsAll = app.tips;

  const [expBucket, setExpBucket] = useState(2);
  const [season, setSeason] = useState("all");
  const [tod, setTod] = useState(-1);
  const [weatherNow, setWeatherNow] = useState<CurrentWeather | null>(null);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCurrentOmsk(app.national.overview.weathers)
      .then((w) => alive && setWeatherNow(w))
      .catch((e) => alive && setWeatherErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [app.national.overview.weathers]);

  useEffect(() => {
    const m = new Date().getMonth() + 1;
    setSeason(m === 12 || m <= 2 ? "Зима" : m <= 5 ? "Весна" : m <= 8 ? "Лето" : "Осень");
  }, []);

  const filtered = useMemo(() => {
    return [...tipsAll.rules]
      .filter((t) => {
        if (t.scope === "experience" && t.when.experience_bucket !== app.experience.buckets[expBucket])
          return false;
        if (tod >= 0 && t.when.tod !== undefined && t.when.tod !== ["Ночь", "Утро", "День", "Вечер"][tod])
          return false;
        if (season !== "all" && t.scope === "season_time" && t.when.season !== season) return false;
        return true;
      })
      .sort((a, b) => b.lift - a.lift);
  }, [tipsAll.rules, app.experience.buckets, expBucket, season, tod]);

  const weatherRule = useMemo(() => {
    if (!weatherNow?.matchWeather) return null;
    return tipsAll.rules.find(
      (t) => t.scope === "weather" && t.when.weather === weatherNow.matchWeather,
    );
  }, [tipsAll.rules, weatherNow]);

  const selectCls = "rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs";

  return (
    <div className="space-y-4">
      <Card title="Погода в Омске прямо сейчас">
        {weatherNow ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="text-3xl font-bold text-white">{Math.round(weatherNow.tempC)}°C</div>
              <div className="text-sm text-slate-400">
                {weatherNow.label}, ветер {Math.round(weatherNow.windMs)} м/с
              </div>
            </div>
            {weatherRule ? (
              <div className="min-w-[260px] flex-1 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white">⚠️ {weatherRule.title}</h4>
                  <Badge tone="red">×{weatherRule.lift.toFixed(2)}</Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{weatherRule.text}</p>
              </div>
            ) : (
              <div className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
                ✅ Для текущей погоды нет правил повышенного риска — статистика не выделяет её как опасную.
              </div>
            )}
          </div>
        ) : weatherErr ? (
          <p className="text-sm text-slate-500">
            Сервис погоды недоступен ({weatherErr}) — советы построены на исторической статистике.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Запрашиваем Open-Meteo…</p>
        )}
      </Card>

      <Card title="Персонализация советов" subtitle="Правила рассчитаны по всей стране">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate-400">Стаж:</span>
            <select value={expBucket} onChange={(e) => setExpBucket(Number(e.target.value))} className={selectCls}>
              {app.experience.buckets.map((b, i) => (<option key={b} value={i}>{b} лет</option>))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-400">Сезон:</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)} className={selectCls}>
              <option value="all">Любой</option>
              {["Зима", "Весна", "Лето", "Осень"].map((s) => (<option key={s}>{s}</option>))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-400">Когда едешь:</span>
            <select value={tod} onChange={(e) => setTod(Number(e.target.value))} className={selectCls}>
              <option value={-1}>Любое время</option>
              {["Ночь (23–06)", "Утро (06–12)", "День (12–18)", "Вечер (18–23)"].map((t, i) => (
                <option key={t} value={i}>{t}</option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-xs text-slate-400">
            Активных правил: <b className="text-orange-300">{filtered.length}</b> из {tipsAll.rules.length}
          </span>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t) => (
          <div
            key={t.id}
            className={`rounded-2xl border p-4 transition hover:border-orange-500/50 ${
              t.lift >= 1.3 ? "border-red-500/25 bg-red-500/[0.06]" : "border-slate-800 bg-slate-900/50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">{t.title}</h4>
              <Badge tone={t.lift >= 1.3 ? "red" : "orange"}>×{t.lift.toFixed(2)}</Badge>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{t.text}</p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1.5">
                {t.tags.map((tag) => (
                  <span key={tag} className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
              <span className="text-[10px] text-slate-600">n={t.n.toLocaleString("ru-RU")}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
            Под эти фильтры правил не нашлось — это хорошая новость 🙂
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Как читать ×N: во сколько раз условный риск выше базового. Правила публикуются при
        выборке n ≥ {tipsAll.thresholds.min_n[1]} и отклонении риска ≥{" "}
        {Math.round((tipsAll.thresholds.lift_min - 1) * 100)}%. База:{" "}
        {tipsAll.baseline.accidents_total.toLocaleString("ru-RU")} ДТП России, доля тяжёлых
        исходов {(tipsAll.baseline.severe_share * 100).toFixed(0)}%.
      </p>
    </div>
  );
}
