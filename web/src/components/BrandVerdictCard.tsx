import { useState } from "react";
import ShareButton from "./ShareButton";
import { nf } from "../lib/format";
import { compareBrands, noDifferenceText, plural, verdict, type Finding } from "../lib/findings";
import type { BrandDetail } from "../lib/types";
import { useApp } from "../state/AppState";
import { useProfile } from "../state/ProfileContext";

/**
 * Карточка сравнения марок — главный виральный объект продукта (план v3).
 *
 * Проектируется не как часть сайта, а как медиа-объект: её скринят и
 * пересылают, поэтому внутри неё самой должны быть название проекта,
 * что сравнивается, период, `n` и источник. Без этого через два
 * пересланных чата это безымянная картинка с двумя цифрами.
 *
 * Порядок жёсткий и следует принципу «сначала вердикт, потом данные»:
 *   вердикт → находки → доказательства → действие
 *
 * Помещается в экран 390×844 целиком до блока доказательств.
 */
export default function BrandVerdictCard({
  nameA,
  a,
  nameB,
  b,
}: {
  nameA: string;
  a: BrandDetail;
  nameB: string;
  b: BrandDetail;
}) {
  const app = useApp();
  const { profile } = useProfile();
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const findings = compareBrands({ nameA, a, nameB, b });
  const main = verdict(findings);
  const rest = findings.filter((f) => f !== main);

  // Своя марка подсвечена: репост говорит что-то о самом человеке,
  // и это то, ради чего им делятся.
  const mine = profile.brand?.toUpperCase();
  const isMine = (n: string) => mine != null && n.toUpperCase() === mine;

  const sample = Math.min(a.total, b.total);

  return (
    <div className="share-card">
      {/* Шапка объекта: без неё скриншот теряет происхождение */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
          <span className="lvl-meta font-semibold uppercase text-slate-400">ДТП Аналитика</span>
        </div>
        <span className="lvl-meta num">{app.meta.date_min?.slice(0, 4)}–{app.meta.date_max?.slice(0, 4)}</span>
      </div>

      {/* Кто с кем */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <BrandName name={nameA} mine={isMine(nameA)} />
        <span className="lvl-support opacity-50">×</span>
        <BrandName name={nameB} mine={isMine(nameB)} />
      </div>

      {/* Вердикт */}
      <p className="lvl-verdict mt-3">{main ? main.text : noDifferenceText(nameA, nameB)}</p>

      <p className="lvl-meta mt-2">
        Выборка: <span className="num">{nf.format(sample)}</span> ДТП по меньшей из марок · открытые
        данные ГИБДД
      </p>

      {/* Находки */}
      {rest.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-slate-800/70 pt-3">
          {rest.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              open={openEvidence === f.id}
              onToggle={() => setOpenEvidence((c) => (c === f.id ? null : f.id))}
            />
          ))}
        </ul>
      )}

      {/* Действие — на уровне действия, а не опоры: раньше кнопка
          сливалась с фоном и её буквально не находили */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ShareButton
          path="/fleet"
          params={{ brand: nameA, vs: nameB }}
          title={`${nameA} × ${nameB}: ${main ? main.text : "сравнение по данным ГИБДД"}`}
          label="Поделиться"
          className="lvl-action !border-0 !text-white"
        />
        {!mine && (
          <span className="lvl-support">
            Укажи свою марку в профиле — она будет подсвечена в сравнении
          </span>
        )}
      </div>
    </div>
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
      {mine && <span className="lvl-meta" style={{ color: "var(--accent)" }}>твоя</span>}
    </span>
  );
}

/**
 * Находка со сворачиваемым доказательством.
 *
 * Числа спрятаны под тап намеренно: на экране 390px пять находок с
 * раскрытыми таблицами не помещаются, а вердикт должен быть виден
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
        <dl className="mt-1.5 space-y-1 rounded-lg bg-slate-900/50 p-2.5">
          {finding.evidence.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="lvl-support">{label}</dt>
              <dd className="lvl-support num font-semibold text-slate-200">{value}</dd>
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

/** Подпись под карточкой, когда находок мало — чтобы не выглядело поломкой. */
export function findingsSummary(count: number): string {
  if (count === 0) return "Заметных различий не нашлось";
  return `${count} ${plural(count, "отличие", "отличия", "отличий")} в данных`;
}
