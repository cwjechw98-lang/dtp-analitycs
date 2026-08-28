import { useMemo, useState } from "react";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";
import { runResearchFindings } from "../lib/researchFindings";
import { Section } from "./ui";
import DonatePlate from "./DonatePlate";
import SupportModal from "./SupportModal";

/**
 * Share / Report (Этап G). Кнопка «Поделиться» сохраняет всё текущее
 * состояние исследования (filter state в URL — ResearchProvider уже пишет
 * его через history.replaceState), поэтому шарим текущий location.href.
 * Открытие ссылки восстанавливает исследование.
 */
export default function ResearchShare() {
  const app = useApp();
  const { filteredRows } = useResearch();
  const [reportOpen, setReportOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const find = useMemo(() => {
    if (app.scope === "ALL" || !app.regionFile) return null;
    return runResearchFindings(filteredRows(app.regionFile.rows), app.regionFile.rows, app.dicts)[0] ?? null;
  }, [app.scope, app.regionFile, app.dicts, filteredRows]);

  const n = useMemo(() => {
    if (app.scope === "ALL" || !app.regionFile) return app.meta.total_accidents;
    return filteredRows(app.regionFile.rows).length;
  }, [app.scope, app.regionFile, app.meta, filteredRows]);

  const regionName = app.scope === "ALL"
    ? "вся Россия"
    : app.meta.regions.find((r) => r.slug === app.scope)?.name ?? app.scope;

  const summary = find?.text ?? `Выборка: ${n.toLocaleString("ru-RU")} ДТП.`;

  const share = async () => {
    const url = location.href; // уже содержит все фильтры (writeUrl)
    const title = `ДТП Аналитика — ${regionName}, ${n.toLocaleString("ru-RU")} ДТП`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
    } catch (e) { if ((e as Error)?.name === "AbortError") return; }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`${summary}\n${location.href}`).catch(() => {});
  };

  return (
    <Section>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={share}
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-orange-600"
        >
          Поделиться
        </button>
        <button
          onClick={copy}
          className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500"
        >
          Скопировать вывод
        </button>
        <button
          onClick={() => setReportOpen((v) => !v)}
          className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500"
        >
          Отчёт
        </button>
      </div>

      {/* Монетизационная плашечка: появляется после «зрелого» пребывания (польза уже получена) */}
      <DonatePlate onSupport={() => setSupportOpen(true)} />

      {reportOpen && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 print:block">
          <h2 className="text-base font-semibold text-white">ДТП Аналитика — исследование</h2>
          <div className="mt-1 text-xs text-slate-500">
            {app.meta.coverage} · {app.meta.source_period ?? ""} · сгенерировано {new Date().toLocaleDateString("ru-RU")}
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <div><b>Фильтры:</b> {regionName}, {n.toLocaleString("ru-RU")} ДТП</div>
            {find && (
              <div>
                <b>Главное:</b> {find.text}
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  {find.evidence.map(([k, v]) => (
                    <span key={k} className="rounded bg-slate-800/70 px-1.5 py-0.5">{k}: <b className="text-slate-300">{v}</b></span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Источник: открытые данные ГИБДД (dtp-stat.ru). Отражает концентрацию зарегистрированных ДТП, а не риск попасть в ДТП.
          </p>
        </div>
      )}
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </Section>
  );
}
