import ShareButton from "./ShareButton";
import VerdictCard from "./VerdictCard";
import { nf } from "../lib/format";
import { corridorFindings, plural, type CorridorInput } from "../lib/findings";
import { useApp } from "../state/AppState";

/**
 * Карточка вердикта по маршруту.
 *
 * Использует ту же оболочку VerdictCard, что и карточка марок: смысл двух
 * контрольных сцен в том, чтобы они читались одним продуктом, а не двумя
 * разными экранами одного сайта. Различается только содержимое.
 */
export default function RouteVerdictCard({
  from,
  to,
  distanceKm,
  corridor,
  bufferM,
  shareParams,
}: {
  from: string;
  to: string;
  distanceKm: number;
  corridor: CorridorInput;
  bufferM: number;
  shareParams: Record<string, string | number | null | undefined>;
}) {
  const app = useApp();
  const o = app.national.overview;

  const findings = corridorFindings(corridor, {
    total: app.meta.total_accidents,
    severityTotals: o.severity_totals as [number, number, number],
    categories: o.categories,
    weathers: o.weathers,
  });

  const main = findings[0] ?? null;

  return (
    <VerdictCard
      subject={
        <h2 className="text-lg font-extrabold tracking-tight" style={{ color: "var(--heading)" }}>
          {from} → {to}
        </h2>
      }
      meta={
        <>
          <span className="num">{distanceKm.toFixed(0)}</span> км · коридор{" "}
          <span className="num">±{bufferM}</span> м
        </>
      }
      verdict={
        main
          ? main.text
          : `На маршруте найдено ${nf.format(corridor.total)} ${plural(corridor.total, "происшествие", "происшествия", "происшествий")} — по ключевым показателям дорога не отличается от средней по стране.`
      }
      sampleNote={
        <>
          Выборка: <span className="num">{nf.format(corridor.total)}</span> ДТП в коридоре ·
          открытые данные ГИБДД
        </>
      }
      findings={findings.slice(1)}
      action={
        <div className="flex flex-wrap gap-2">
          <ShareButton
            path="/route"
            params={shareParams}
            title={`${from} → ${to}: ${main ? main.text : `${corridor.total} ДТП вдоль маршрута`}`}
            label="Поделиться"
            className="lvl-action !border-0 !text-white"
          />
          <button
            onClick={() => window.print()}
            className="lvl-action-quiet !border-0 !text-white print:hidden"
            title="Печать / сохранить в PDF"
          >
            Отчёт
          </button>
        </div>
      }
    />
  );
}
