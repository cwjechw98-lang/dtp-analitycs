import { useState, type ReactNode } from "react";
import { nf } from "../lib/format";
import type { Finding } from "../lib/findings";
import { useApp } from "../state/AppState";

/**
 * Общая оболочка карточки вердикта.
 *
 * До этого разметка была скопирована трижды — сравнение марок, досье
 * одной марки, маршрут. Копии неизбежно расходятся, а вся идея двух
 * контрольных сцен была в том, чтобы они читались одним продуктом.
 * Теперь у них буквально один компонент, различается только содержимое.
 *
 * Порядок жёсткий: идентика → предмет → вердикт → выборка → находки →
 * действие. Это принцип «сначала вердикт, потом данные», зашитый в
 * структуру, а не оставленный на усмотрение каждого экрана.
 */
export default function VerdictCard({
  subject,
  meta,
  verdict,
  sampleNote,
  findings,
  action,
  footnote,
}: {
  /** Предмет: пара марок, одна марка, точки маршрута */
  subject: ReactNode;
  /** Подпись под предметом: километры, число записей */
  meta?: ReactNode;
  verdict: string;
  sampleNote: ReactNode;
  findings: Finding[];
  action?: ReactNode;
  footnote?: ReactNode;
}) {
  const app = useApp();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="share-card">
      {/* Шапка объекта: карточку скринят, без неё скриншот теряет
          происхождение и через два чата становится безымянным. */}
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
        {subject}
        {meta && <p className="lvl-meta mt-0.5">{meta}</p>}
      </div>

      <p className="lvl-verdict mt-3">{verdict}</p>
      <p className="lvl-meta mt-2">{sampleNote}</p>

      {findings.length > 0 && (
        <ul className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {findings.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              open={open === f.id}
              onToggle={() => setOpen((c) => (c === f.id ? null : f.id))}
            />
          ))}
        </ul>
      )}

      {action && <div className="mt-4">{action}</div>}
      {footnote && <p className="lvl-meta mt-3 leading-snug">{footnote}</p>}
    </div>
  );
}

/**
 * Находка со свёрнутыми числами.
 *
 * Числа спрятаны под тап намеренно: на экране 390px пять находок с
 * раскрытыми таблицами не помещаются, а вердикт обязан быть виден
 * без прокрутки. Кому нужны цифры — тот их откроет.
 */
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
            {finding.kind === "descriptive" && " · счёт внутри выборки, не сравнение с базой"}
          </div>
        </dl>
      )}
    </li>
  );
}
