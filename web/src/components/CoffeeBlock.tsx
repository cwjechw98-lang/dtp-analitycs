import { useEffect, useState } from "react";
import { nf } from "../lib/format";

/**
 * Благодарность автору (контракт §8, этап 5).
 *
 * Место выбрано не случайно: блок показывается сразу после готового отчёта
 * по маршруту — в момент, когда человек уже получил пользу. В шапке или
 * плавающей плашкой та же просьба конвертит почти в ноль, потому что
 * просит до того, как что-то дал.
 *
 * Формулировка конкретная и проверяемая: сколько записей обработано, что
 * именно стоит денег и труда. Абстрактное «поддержи проект ❤️» не работает.
 */

interface Support {
  /** цель в рублях на месяц: хостинг, домен, трафик */
  goal: number;
  raised: number;
  /** YYYY-MM, к которому относятся цифры */
  month: string;
  updated: string;
}

const TIPS_URL = import.meta.env.VITE_TIPS_URL ?? "";

export default function CoffeeBlock({ accidentsScanned }: { accidentsScanned?: number }) {
  const [support, setSupport] = useState<Support | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    fetch(`${base}data/support.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Support | null) => {
        if (!j) return;
        // Счётчик обновляется руками, поэтому прячем протухшие цифры:
        // «собрано 0 ₽ за март» в августе выглядит как заброшенный проект.
        const age = (Date.now() - new Date(j.updated).getTime()) / 86400000;
        if (age <= 45) setSupport(j);
      })
      .catch(() => {
        /* файла нет — показываем просто просьбу без счётчика */
      });
  }, []);

  if (!TIPS_URL) return null;

  const pct = support ? Math.min(100, Math.round((support.raised / support.goal) * 100)) : 0;

  return (
    <div className="glass rounded-2xl border border-slate-800/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[260px] flex-1">
          <h3 className="text-sm font-semibold text-white">Если пригодилось</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Этот отчёт собран из {nf.format(1602164)} записей ГИБДД
            {accidentsScanned ? `, из них ${nf.format(accidentsScanned)} попали в коридор маршрута` : ""}.
            Данные пересобираются каждый понедельник — это мой вечер и деньги за трафик и домен.
            Сервис бесплатный и таким останется.
          </p>

          {support && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[11px] text-slate-400">
                <span>
                  Собрано в этом месяце: <b className="text-slate-200">{nf.format(support.raised)} ₽</b> из{" "}
                  {nf.format(support.goal)} ₽
                </span>
                <span className="text-slate-500">{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-600">
                Цель — хостинг и домен на месяц. Всё, что сверх, идёт на расширение данных.
              </p>
            </div>
          )}
        </div>

        <a
          href={TIPS_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            // Отдельное событие: конверсия в клик — главная метрика этапа 5.
            import("../lib/analytics").then((m) => m.trackTip());
          }}
          className="glow-ring shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition"
          style={{ backgroundColor: "var(--accent)" }}
        >
          ☕ На кофе автору
        </a>
      </div>
    </div>
  );
}
