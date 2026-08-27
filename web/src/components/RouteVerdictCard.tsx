import { useState } from "react";
import ShareButton from "./ShareButton";
import { nf } from "../lib/format";
import { corridorFindings, plural, type CorridorInput, type Finding } from "../lib/findings";
import { useApp } from "../state/AppState";

/**
 * Карточка вердикта по маршруту — вторая контрольная сцена этапа 2.5.
 *
 * Намеренно повторяет устройство BrandVerdictCard: шапка с идентикой,
 * предмет, вердикт, находки со сворачиваемыми числами, действие. Смысл
 * двух контрольных сцен в том, чтобы они ощущались одним продуктом, а не
 * двумя разными экранами одного сайта.
 *
 * Отличие только в предмете: там пара марок, здесь коридор дороги.
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
  const [open, setOpen] = useState<string | null>(null);

  const o = app.national.overview;
  const findings = corridorFindings(corridor, {
    total: app.meta.total_accidents,
    severityTotals: o.severity_totals as [number, number, number],
    categories: o.categories,
    weathers: o.weathers,
  });

  const main = findings[0] ?? null;
  const rest = findings.slice(1);

  return (
    <div className="share-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
          <span className="lvl-meta font-semibold uppercase" style={{ color: "var(--muted)" }}>
            ДТП Аналитика
          </span>
        </div>
        <span className="lvl-meta num">
          {app.meta.date_min?.slice(0, 4)}–{app.meta.date_max?.slice(0, 4)}
        </span>
      </div>

      <div className="mt-3">
        <h2 className="text-lg font-extrabold tracking-tight" style={{ color: "var(--heading)" }}>
          {from} → {to}
        </h2>
        <p className="lvl-meta mt-0.5">
          <span className="num">{distanceKm.toFixed(0)}</span> км · коридор{" "}
          <span className="num">±{bufferM}</span> м
        </p>
      </div>

      <p className="lvl-verdict mt-3">
        {main
          ? main.text
          : `На маршруте найдено ${nf.format(corridor.total)} ${plural(corridor.total, "происшествие", "происшествия", "происшествий")} — по ключевым показателям дорога не отличается от средней по стране.`}
      </p>

      <p className="lvl-meta mt-2">
        Выборка: <span className="num">{nf.format(corridor.total)}</span> ДТП в коридоре · открытые
        данные ГИБДД
      </p>

      {rest.length > 0 && (
        <ul
          className="mt-4 space-y-2 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          {rest.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              open={open === f.id}
              onToggle={() => setOpen((c) => (c === f.id ? null : f.id))}
            />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <ShareButton
          path="/route"
          params={shareParams}
          title={`${from} → ${to}: ${main ? main.text : `${corridor.total} ДТП вдоль маршрута`}`}
          label="Поделиться"
          className="lvl-action !border-0 !text-white"
        />
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  open,
  onToggle,
}: {
  finding: Finding;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button onClick={onToggle} className="w-full text-left">
        <span className="lvl-finding block">{finding.text}</span>
        <span className="lvl-meta mt-0.5 block underline decoration-dotted">
          {open ? "скрыть числа" : "показать числа"}
        </span>
      </button>
      {open && (
        <dl className="mt-1.5 space-y-1 rounded-lg p-2.5" style={{ background: "var(--panel-b)" }}>
          {finding.evidence.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="lvl-support">{label}</dt>
              <dd className="lvl-support num font-semibold" style={{ color: "var(--heading)" }}>
                {value}
              </dd>
            </div>
          ))}
          <div className="lvl-meta pt-0.5">
            <span className="num">n = {nf.format(finding.n)}</span>
            {finding.kind === "descriptive" && " · счёт внутри коридора, не сравнение с базой"}
          </div>
        </dl>
      )}
    </li>
  );
}
