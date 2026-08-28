import { useMemo, useState } from "react";
import OverviewTab from "../components/OverviewTab";
import TimeTab from "../components/TimeTab";
import MapTab from "../components/MapTab";
import ResearchFilterBar from "../components/ResearchFilterBar";
import ResearchSheet from "../components/ResearchSheet";
import ResearchFindings from "../components/ResearchFindings";
import ResearchShare from "../components/ResearchShare";
import CoffeeBlock from "../components/CoffeeBlock";
import StatBoard from "../components/StatBoard";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";
import { useSeo } from "../lib/seo";

/**
 * Atlas Research Surface (Этап C, редизайн по фидбеку).
 * Сверху — компактная строка состояния (чипы активных фильтров +
 * «Изменить фильтры» + «Сбросить»). Карта на всю ширину, НИКОГДА не
 * ужимается. Панель фильтров выезжает поверх: desktop — боковая ~380px,
 * mobile — bottom sheet. Закрыл — осталось исследование с чипами.
 */

export default function AtlasPage() {
  const app = useApp();
  const { filteredRows } = useResearch();
  const [sheetOpen, setSheetOpen] = useState(false);
  const regionName = app.scope === "ALL" ? "Россия" : app.meta.regions.find((r) => r.slug === app.scope)?.name ?? "Россия";
  useSeo(`Статистика ДТП: ${regionName} — карта, фильтры, находки`, `Интерактивная аналитика ДТП в регионе ${regionName}: карта происшествий, фильтры по классу ТС, участникам и инфраструктуре.`);

  const filtered = useMemo(() => {
    if (app.scope === "ALL" || !app.regionFile) return null;
    return filteredRows(app.regionFile.rows);
  }, [app.scope, app.regionFile, filteredRows]);

  const rowsProp = filtered ?? undefined;

  return (
    <div className="space-y-3">
      {/* Строка состояния: чипы + Изменить фильтры + Сбросить */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ResearchFilterBar onOpen={() => setSheetOpen(true)} />
      </div>

      {/* Карта на всю ширину — никогда не ужимается фильтрами */}
      <section id="map" className="scroll-mt-[150px]">
        <MapTab key={`${app.scope}-r`} rows={rowsProp} />
      </section>

      {!app.regionFile && app.scope !== "ALL" ? null : (
        <>
          <StatBoard />
          <section id="overview" className="scroll-mt-[150px]">
            <OverviewTab rows={rowsProp} />
          </section>
          <ResearchFindings />
          <ResearchShare />
          <CoffeeBlock />
          <section id="time" className="scroll-mt-[150px]">
            <TimeTab rows={rowsProp} />
          </section>
        </>
      )}

      {/* Выезжающая панель фильтров (desktop side / mobile bottom sheet) */}
      <ResearchSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
