import { useMemo } from "react";
import ShareButton from "./ShareButton";
import VerdictCard from "./VerdictCard";
import { nf } from "../lib/format";
import {
  brandVsFleet,
  compareBrands,
  fleetBaseline,
  noDifferenceText,
  verdict,
} from "../lib/findings";
import type { BrandDetail, BrandsFile } from "../lib/types";
import { useApp } from "../state/AppState";
import { useProfile } from "../state/ProfileContext";

/**
 * Карточка марок — работает и на одной марке, и на паре.
 *
 * Одиночный режим появился по жалобе «хочу посмотреть только BMW, а меня
 * заставляют что-то с чем-то сравнивать». Раньше досье одной марки давал
 * компонент BrandCard, но я удалил его вместе с дублирующим путём поиска,
 * не заметив, что он закрывал отдельный сценарий. Это была регрессия.
 *
 * Теперь одиночная марка сравнивается не с соперником, а со средним по
 * всему автопарку — то есть вердикт есть всегда, даже без второй марки.
 */
export default function BrandVerdictCard({
  brandsFile,
  names,
  onAddSecond,
}: {
  brandsFile: BrandsFile;
  /** одна или две марки; ключи уже разрешены к реальным */
  names: string[];
  /** Раскрыть выбор, чтобы добавить вторую марку. */
  onAddSecond?: () => void;
}) {
  const app = useApp();
  const { profile } = useProfile();

  const fleet = useMemo(() => fleetBaseline(brandsFile.brands), [brandsFile]);

  const mine = profile.brand?.toUpperCase();
  const isMine = (n: string) => mine != null && n.toUpperCase() === mine;

  const solo = names.length === 1;
  const a: BrandDetail = brandsFile.brands[names[0]];
  const b: BrandDetail | undefined = names[1] ? brandsFile.brands[names[1]] : undefined;

  const findings = useMemo(
    () =>
      solo
        ? brandVsFleet(names[0], a, fleet)
        : compareBrands({ nameA: names[0], a, nameB: names[1], b: b! }),
    [solo, names, a, b, fleet],
  );

  const main = solo ? findings[0] ?? null : verdict(findings);
  const rest = findings.filter((f) => f !== main);

  const sample = solo ? a.total : Math.min(a.total, b!.total);

  return (
    <VerdictCard
      subject={
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <BrandName name={names[0]} mine={isMine(names[0])} />
          {!solo && (
            <>
              <span className="lvl-support opacity-50">×</span>
              <BrandName name={names[1]} mine={isMine(names[1])} />
            </>
          )}
        </div>
      }
      meta={
        solo ? (
          <>
            <span className="num">{nf.format(a.total)}</span> записей в выборке
            {/* Тип ТС появляется после пересборки данных: до неё поля
                просто нет, и подпись не рисуется. */}
            {a.cat ? ` · ${a.cat.toLowerCase()}` : ""}
          </>
        ) : undefined
      }
      verdict={
        main
          ? main.text
          : solo
            ? `По ключевым показателям ${names[0]} не отличается от среднего по автопарку.`
            : noDifferenceText(names[0], names[1])
      }
      sampleNote={
        <>
          Выборка: <span className="num">{nf.format(sample)}</span> ДТП
          {solo ? "" : " по меньшей из марок"} · открытые данные ГИБДД
        </>
      }
      findings={rest}
      action={
        <div className="flex flex-wrap gap-2">
          {/* Следующее действие стоит в самой карточке и на уровне
              действия. Раньше «добавить вторую марку» было пассивной
              подписью внизу, а поиск прятался за ссылкой «изменить
              выбор» — понять, что сравнение вообще существует, было
              неоткуда. */}
          {solo && onAddSecond && (
            <button onClick={onAddSecond} className="lvl-action">
              + Сравнить с другой маркой
            </button>
          )}
          <ShareButton
            path="/fleet"
            params={{ brand: names[0], vs: names[1] ?? null }}
            title={`${names.join(" × ")}: ${main ? main.text : "по данным ГИБДД"}`}
            label="Поделиться"
            className={solo ? "lvl-action-quiet" : "lvl-action !border-0 !text-white"}
          />
        </div>
      }
      footnote={
        solo
          ? "Показатели сравниваются со средним по всему автопарку."
          : !mine
            ? "Укажи свою марку в профиле — она будет подсвечена в сравнении."
            : undefined
      }
    />
  );
}

function BrandName({ name, mine }: { name: string; mine: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className="text-lg font-extrabold tracking-tight"
        style={{ color: mine ? "var(--accent)" : "var(--heading)" }}
      >
        {name}
      </span>
      {mine && (
        <span className="lvl-meta" style={{ color: "var(--accent)" }}>
          твоя
        </span>
      )}
    </span>
  );
}
