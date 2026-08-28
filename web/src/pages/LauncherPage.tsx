import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import VerdictCard from "../components/VerdictCard";
import { nf } from "../lib/format";
import { brandVsFleet, fleetBaseline, isRealBrand } from "../lib/findings";
import { buildFacts, pickFact } from "../lib/researchFacts";
import { trackFactOpen, trackLauncherClick } from "../lib/analytics";
import type { BrandsFile } from "../lib/types";
import { useApp } from "../state/AppState";
import { useProfile } from "../state/ProfileContext";

/**
 * Launcher на `/` (план v3, этап 5A).
 *
 * До этого голый домен редиректил на /route, то есть человек из Threads
 * попадал прямо в пустую форму «введите А и Б» — в старое first-state,
 * мимо всей новой подачи. Заодно RouteTab дописывал в адрес свой дефолт,
 * и публичный вход выглядел как /route?exp=3.
 *
 * Это не лендинг: ни обещаний, ни преимуществ, ни призывов. Три
 * намерения и одна настоящая находка, посчитанная тем же движком, что
 * работает во всех разделах. Человек либо кликает намерение, либо
 * проваливается в находку.
 */

const INTENTS = [
  {
    to: "/atlas",
    title: "Исследовать карту",
    hint: "Кто, где и при каких условиях чаще попадает в ДТП",
    primary: true,
  },
  {
    to: "/route",
    title: "Проверить маршрут",
    hint: "Что происходило на дороге, по которой поедешь",
  },
  {
    to: "/fleet",
    title: "Сравнить машины",
    hint: "Чем одна марка отличается от другой в 1,6 млн записей",
  },
  {
    to: "/me",
    title: "Свой риск",
    hint: "Стаж и марка против статистики по стране",
  },
] as const;

export default function LauncherPage() {
  const app = useApp();
  const { profile } = useProfile();

  // brands.json грузится отдельно (447 КБ) и живёт не в общем состоянии.
  // Лаунчер показывается сразу, находка дня появляется, когда файл доехал —
  // блокировать первый экран ради неё нельзя.
  const [brandsFile, setBrandsFile] = useState<BrandsFile | null>(null);
  useEffect(() => {
    let alive = true;
    app.loadBrands().then((f) => alive && setBrandsFile(f)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [app]);

  /**
   * Находка дня. Детерминированная, а не случайная: одна и та же на весь
   * день для всех. Случайная при каждом заходе означала бы, что человек
   * не может вернуться к тому, что видел, и не может это переслать.
   */
  const daily = useMemo(() => {
    const bf = brandsFile;
    if (!bf) return null;
    const base = fleetBaseline(bf.brands);

    // Кандидаты — заметные марки: на мелких находка была бы про шум.
    const pool = Object.keys(bf.brands)
      .filter((n) => isRealBrand(n) && bf.brands[n].total >= 20_000)
      .sort((x, y) => bf.brands[y].total - bf.brands[x].total)
      .slice(0, 40);
    if (!pool.length) return null;

    // Своя марка из профиля важнее случайной: находка про себя цепляет
    // сильнее находки про кого-то.
    const mine = profile.brand && pool.find((n) => n.toUpperCase() === profile.brand!.toUpperCase());

    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const name = mine ?? pool[dayIndex % pool.length];

    const found = brandVsFleet(name, bf.brands[name], base);
    if (!found.length) return null;

    /*
     * Разнообразие формулировок, а не только марок.
     *
     * Сильнейшая находка у большинства массовых марок — одна и та же
     * («нарушение правил проезда пешеходного перехода»), поэтому подряд
     * идущие дни выглядели бы одинаково. Если у вчерашней марки топовая
     * находка того же типа, берём следующую по силе.
     */
    const prev = pool[(dayIndex - 1 + pool.length) % pool.length];
    const prevTop = prev ? brandVsFleet(prev, bf.brands[prev], base)[0]?.id : null;
    const pick = found.find((f) => f.id !== prevTop) ?? found[0];

    return { name, findings: [pick], isMine: Boolean(mine) };
  }, [brandsFile, profile.brand]);

  // Проверенный факт из пула (детерминированный, не LLM) — из national, грузится сразу.
  const fact = useMemo(() => pickFact(buildFacts(app.national, app.meta)), [app.national, app.meta]);

  return (
    <div className="space-y-7">
      <section>
        <h1 className="lvl-verdict">Что случалось на этой дороге до тебя</h1>
        <p className="lvl-support mt-2">
          <span className="num">{nf.format(app.meta.total_accidents)}</span> ДТП по открытым данным
          ГИБДД, <span className="num">{app.meta.regions.length}</span> регионов,{" "}
          <span className="num">
            {app.meta.date_min?.slice(0, 4)}–{app.meta.date_max?.slice(0, 4)}
          </span>
          . Обновляется каждую неделю.
        </p>
      </section>

      <section className="space-y-2">
        {INTENTS.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            onClick={() => trackLauncherClick(i.to)}
            className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5 transition"
            style={{ borderColor: "var(--border)", background: "var(--panel-b)" }}
          >
            <span className="min-w-0">
              <span
                className="block text-sm font-semibold"
                style={{ color: "var(--heading)" }}
              >
                {i.title}
              </span>
              <span className="lvl-meta mt-0.5 block">{i.hint}</span>
            </span>
            <span className="shrink-0 text-lg" style={{ color: "var(--accent)" }}>
              →
            </span>
          </Link>
        ))}
      </section>

      {fact && (
        <section>
          <h2
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--muted)" }}
          >
            {fact.category} · {fact.period}
          </h2>
          <Link to={fact.deepLink} onClick={() => trackFactOpen(fact.id)} className="block">
            <VerdictCard
              subject={<span className="text-lg font-extrabold tracking-tight" style={{ color: "var(--heading)" }}>{fact.title}</span>}
              verdict={`В данных ГИБДД: ${fact.text}`}
              sampleNote={
                <>
                  Выборка: <span className="num">{nf.format(fact.n)}</span> · период {fact.period}
                </>
              }
              findings={[]}
              footnote="Открыть исследование →"
            />
          </Link>
        </section>
      )}

      {daily && (
        <section>
          <h2
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--muted)" }}
          >
            {daily.isMine ? "Про твою марку" : "Сегодня в данных"}
          </h2>
          <Link to={`/fleet?brand=${encodeURIComponent(daily.name)}`} className="block">
            <VerdictCard
              subject={
                <span
                  className="text-lg font-extrabold tracking-tight"
                  style={{ color: daily.isMine ? "var(--accent)" : "var(--heading)" }}
                >
                  {daily.name}
                </span>
              }
              verdict={daily.findings[0].text}
              sampleNote={
                <>
                  Выборка:{" "}
                  <span className="num">{nf.format(brandsFile!.brands[daily.name].total)}</span>{" "}
                  ДТП · открытые данные ГИБДД
                </>
              }
              findings={[]}
              footnote="Открыть полное досье марки →"
            />
          </Link>
        </section>
      )}
    </div>
  );
}
