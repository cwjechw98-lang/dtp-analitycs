import { useEffect, useMemo, useRef, useState } from "react";
import OverviewTab from "../components/OverviewTab";
import TimeTab from "../components/TimeTab";
import MapTab from "../components/MapTab";
import ResearchFilters from "../components/ResearchFilters";
import { useApp } from "../state/AppState";
import { useResearch } from "../state/ResearchContext";

/**
 * Atlas Research Surface (Этап C).
 * Desktop: фильтры сверху (или слева), под ними карта + вывод + графики.
 * Mobile: фильтры — bottom sheet/drawer, главный вывод без длинного scroll.
 * Все поверхности читают единый ResearchProvider state (один источник истины).
 */

export default function AtlasPage() {
  const app = useApp();
  const { filteredRows } = useResearch();
  const [mobileFilters, setMobileFilters] = useState(false);

  const filtered = useMemo(() => {
    if (app.scope === "ALL" || !app.regionFile) return null;
    return filteredRows(app.regionFile.rows);
  }, [app.scope, app.regionFile, filteredRows]);

  const rowsProp = filtered ?? undefined;

  return (
    <div className="space-y-3">
      {/* Mobile: переключатель фильтров (bottom sheet) */}
      <button
        onClick={() => setMobileFilters((v) => !v)}
        className="md:hidden w-full rounded-xl glass border border-slate-800 px-3 py-2 text-left text-sm text-slate-300"
      >
        <span className="font-medium">Фильтры исследования</span>
        <span className="ml-1 text-slate-500">{mobileFilters ? "▴" : "▾"}</span>
      </button>
      {mobileFilters && (
        <div className="md:hidden -mx-1 rounded-xl p-2">
          <ResearchFilters />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Desktop: filter sidebar */}
        <div className="hidden md:block">
          <div className="sticky top-[104px]">
            <ResearchFilters />
          </div>
        </div>

        {/* Research surface */}
        <div className="space-y-4">
          <section id="map" className="scroll-mt-[150px]">
            <MapTab key={`${app.scope}-r`} rows={rowsProp} />
          </section>

          {!app.regionFile && app.scope !== "ALL" ? null : (
            <>
              <section id="overview" className="scroll-mt-[150px]">
                <OverviewTab rows={rowsProp} />
              </section>
              <section id="time" className="scroll-mt-[150px]">
                <TimeTab rows={rowsProp} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
