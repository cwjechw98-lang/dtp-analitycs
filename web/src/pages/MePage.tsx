import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../components/ui";
import { nf } from "../lib/format";
import { EXP_BUCKETS, parseExp } from "../lib/urlState";
import { useApp } from "../state/AppState";
import { useProfile } from "../state/ProfileContext";

/**
 * Раздел «Мой риск» (контракт §5) — личный профиль относительно базы.
 *
 * Никаких выдуманных баллов и уровней: каждая цифра берётся из уже
 * посчитанных агрегатов, рядом стоит база, с которой она сравнивается.
 * Это тот объект, который имеет смысл пересылать — этап 3 добавит
 * пермалинк и OG-карточку.
 *
 * Приоритет по контракту §3: параметры URL перекрывают сохранённый профиль,
 * но не перезаписывают его. Открыв чужую ссылку, ты видишь чужие цифры.
 */
export default function MePage() {
  const app = useApp();
  const { profile, filled } = useProfile();
  const [sp] = useSearchParams();

  const urlExp = parseExp(sp.get("exp"));
  const urlBrand = sp.get("brand");
  const exp = urlExp ?? profile.exp;
  const brandName = urlBrand ?? profile.brand;
  const isShared = urlExp != null || urlBrand != null;

  const expStat = useMemo(
    () => (exp == null ? null : app.national.experience.stats[exp] ?? null),
    [exp, app.national.experience.stats],
  );

  const baseline = app.national.experience.baseline_severe_share;

  if (!filled && !isShared) {
    return (
      <Card title="🎯 Мой риск" subtitle="Заполни профиль в шапке — три поля, десять секунд">
        <p className="text-sm leading-relaxed text-slate-400">
          Профиль нужен, чтобы показывать не средние цифры по стране, а те, что относятся к тебе:
          твой стаж против базовой доли тяжёлых исходов, твоя марка против среднего по автопарку,
          твоё обычное окно выезда против статистики.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Ничего никуда не отправляется — данные остаются в браузере.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isShared && (
        <div className="glass rounded-2xl border border-slate-800/80 px-4 py-2.5 text-xs text-slate-400">
          Показан профиль из ссылки. Твой собственный профиль не изменился.
        </div>
      )}

      <Card
        title="🎯 Мой риск"
        subtitle="Каждая цифра — из общероссийских агрегатов, рядом база для сравнения"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {expStat && (
            <Metric
              label={`Стаж ${EXP_BUCKETS[exp!]} лет`}
              value={`${(expStat.severe_share * 100).toFixed(1)}%`}
              caption="доля тяжёлых исходов"
              base={`база по стране ${(baseline * 100).toFixed(1)}%`}
              delta={expStat.severe_share - baseline}
              n={expStat.accidents}
            />
          )}
          {expStat && (
            <Metric
              label="Ночные поездки"
              value={`${(expStat.night_share * 100).toFixed(1)}%`}
              caption="доля ДТП в ночное время у этого стажа"
              base="ночь — 23:00–06:00"
              n={expStat.accidents}
            />
          )}
        </div>

        {expStat && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Обрати внимание: доля тяжёлых исходов растёт вместе со стажем, а не падает — у водителей
            с 21+ годами она выше, чем у новичков. Скорее всего, дело не в самих навыках, а в том,
            что опытные больше ездят по трассе и на скорости. Это данные о частотах, а не о причинах.
          </p>
        )}
      </Card>

      {brandName && <BrandMetric brandName={brandName} />}

      <Card title="Методология">
        <ul className="space-y-1.5 text-xs leading-relaxed text-slate-400">
          <li>
            Виновником считается водитель, у которого в записи есть нарушение ПДД. Это статистическая
            оценка по открытым данным, а не судебное решение.
          </li>
          <li>
            Частоты не нормированы на пробег и загрузку дорог. Сравнивать можно доли внутри группы,
            но не «во сколько раз безопаснее» между группами разного размера.
          </li>
          <li>
            Всего в выборке {nf.format(app.meta.total_accidents)} ДТП за {app.meta.date_min} —{" "}
            {app.meta.date_max}.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function BrandMetric({ brandName }: { brandName: string }) {
  const app = useApp();
  const brand = app.national.culprits.brands.find(
    (b) => b.brand.toUpperCase() === brandName.toUpperCase(),
  );

  if (!brand) {
    return (
      <Card title="Марка">
        <p className="text-sm text-slate-400">
          По марке «{brandName}» в национальных агрегатах нет данных.
        </p>
      </Card>
    );
  }

  const share = brand.culprit / brand.total;
  const fleetShare =
    app.national.culprits.totals.with_vehicle_culprit / app.national.culprits.totals.accidents / 2;

  return (
    <Card title={`Марка · ${brand.brand}`} subtitle={`${nf.format(brand.total)} записей в выборке`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric
          label="Доля виновника"
          value={`${(share * 100).toFixed(1)}%`}
          caption="в записях с этой маркой водитель был с нарушением"
          base={`в среднем по автопарку ${(fleetShare * 100).toFixed(1)}%`}
          delta={share - fleetShare}
          n={brand.total}
        />
        <Metric
          label="Виновник / пострадавший"
          value={nf.format(brand.culprit) + " / " + nf.format(brand.victim)}
          caption="абсолютные числа записей"
          base=""
          n={brand.total}
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Разброс между марками узкий, и наверху рейтинга обычно оказываются самые массовые и самые
        старые парки. Это не значит, что марка опаснее — это значит, что в её записях чаще
        фиксируется нарушение.
      </p>
    </Card>
  );
}

function Metric({
  label,
  value,
  caption,
  base,
  delta,
  n,
}: {
  label: string;
  value: string;
  caption: string;
  base: string;
  delta?: number;
  n: number;
}) {
  const sign = delta == null ? null : delta > 0 ? "выше" : "ниже";
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{caption}</div>
      {base && <div className="mt-1.5 text-[11px] text-slate-500">{base}</div>}
      {delta != null && sign && (
        <div
          className="mt-1 text-[11px] font-medium"
          style={{ color: delta > 0 ? "#f59e0b" : "#38bdf8" }}
        >
          на {Math.abs(delta * 100).toFixed(1)} п.п. {sign} базы
        </div>
      )}
      <div className="mt-1.5 text-[10px] text-slate-600">n = {nf.format(n)}</div>
    </div>
  );
}
