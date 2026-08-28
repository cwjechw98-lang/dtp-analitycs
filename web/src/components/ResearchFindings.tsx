import { useMemo } from "react";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";
import { runResearchFindings } from "../lib/researchFindings";
import { Section, Card } from "./ui";

/**
 * Findings (Этап E) — извлекает claim-типовые выводы из фильтрованного среза,
 * сравнивая его с общим набором ДТП (базой). Показывает «что в этом срезе
 * выделяется», а не просто график.
 */
export default function ResearchFindings() {
  const app = useApp();
  const { filteredRows } = useResearch();

  const findings = useMemo(() => {
    if (app.scope === "ALL" || !app.regionFile) return [];
    const slice = filteredRows(app.regionFile.rows);
    // база = весь регион (для честного знаменателя «доля в срезе vs доля в наборе»)
    const base = app.regionFile.rows;
    return runResearchFindings(slice, base, app.dicts).slice(0, 4);
  }, [app.scope, app.regionFile, app.dicts, filteredRows]);

  if (app.scope === "ALL") return null;
  if (!findings.length) {
    return (
      <Section>
        <p className="text-sm text-slate-400">
          В этом срезе недостаточно данных для статистически устойчивых выводов.
        </p>
      </Section>
    );
  }

  return (
    <Section>
      <h2 className="mb-2 text-sm font-semibold text-slate-200">Что выделяется</h2>
      <div className="space-y-2">
        {findings.map((f) => (
          <Card key={f.id} className="min-w-0">
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 text-sm ${f.warns ? "🔺" : "🔹"}`} />
              <div>
                <p className="text-sm leading-snug text-slate-200">{f.text}</p>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  {f.evidence.map(([k, v]) => (
                    <span key={k} className="rounded bg-slate-800/70 px-1.5 py-0.5">
                      {k}: <b className="text-slate-300">{v}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}
