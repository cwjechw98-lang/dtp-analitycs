import { useEffect, useMemo, useRef, useState } from "react";
import { useUrlOnce, useUrlWriter } from "../hooks/useUrlSync";
import BrandPicker from "./BrandPicker";
import BrandVerdictCard from "./BrandVerdictCard";
import ResearchBar from "./ResearchBar";
import { motion } from "framer-motion";
import { useApp } from "../state/AppState";
import { useTheme } from "../state/ThemeContext";
import type { BrandDetail, BrandsFile, CulpritBrand } from "../lib/types";
import EChart from "./EChart";
import { Badge, Card, Section } from "./ui";
import type * as echarts from "echarts";

/** Популярные русские названия марок → написание в данных */
const ALIASES: Record<string, string> = {
  БМВ: "BMW", МЕРСЕДЕС: "MERCEDES", МЕРС: "MERCEDES", ФОЛЬКСВАГЕН: "VOLKSWAGEN",
  ТОЙОТА: "TOYOTA", ТАЁТА: "TOYOTA", НИССАН: "NISSAN", ХЕНДАЙ: "HYUNDAI",
  ХЁНДЕ: "HYUNDAI", ШКОДА: "SKODA", АУДИ: "AUDI", ЛАДА: "ВАЗ",
  ЖИГУЛИ: "ВАЗ", МАЗДА: "MAZDA", МИЦУБИСИ: "MITSUBISHI", СУЗУКИ: "SUZUKI",
  СУБАРУ: "SUBARU", РЕНО: "RENAULT", ПЕЖО: "PEUGEOT", СИТРОЕН: "CITROEN",
  ФОРД: "FORD", ШЕВРОЛЕ: "CHEVROLET", ДЭУ: "DAEWOO", ОПЕЛЬ: "OPEL",
  КИА: "KIA", КАМАЗ: "КАМАЗ", ВОЛЬВО: "VOLVO", ХОНДА: "HONDA",
  // китайские марки
  ХАВАЛ: "HAVAL", ХАВАЙЛ: "HAVAL", ЧЕРИ: "CHERY", ДЖИЛИ: "GEELY", ГИЛИ: "GEELY",
  ЧАНГАН: "CHANGAN", ДЖАК: "JAC", БИВАЙДИ: "BYD", БИД: "BYD", ФАВ: "FAW",
  ОМОДА: "OMODA", ЭКСИД: "EXEED", ЭКСЕД: "EXEED", ВЕЛИКИЙ: "GREAT WALL",
  ГРЕЙТ: "GREAT WALL", ДЖЕТУР: "JETOUR", ТАНК: "TANK", ЛИФАН: "LIFAN",
  // корейские
  ССАНГ: "SSANGYONG", ССАНГЁНГ: "SSANGYONG", ГЕНЕЗИС: "GENESIS", ДЖЕНЕСИС: "GENESIS",
};

const SEV_NAMES = ["Лёгкие", "Тяжёлые", "С погибшими"];
const SEV_COLORS = ["#38bdf8", "#f59e0b", "#ef4444"];

type SortKey = "total" | "aggr" | "culpritShare";

export default function FleetTab() {
  const app = useApp();
  const theme = useTheme();
  const [brandsFile, setBrandsFile] = useState<BrandsFile | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const compareRef = useRef<HTMLDivElement>(null);
  /** Растёт при нажатии «сравнить с другой маркой» — раскрывает выбор. */
  const [openPicker, setOpenPicker] = useState(0);

  /**
   * Имя марки → реальный ключ в данных.
   *
   * Из URL марка приходит в верхнем регистре, а в brands.json 13 ключей
   * записаны иначе («НефАЗ»). Прямое обращение brands["НЕФАЗ"] вернуло бы
   * undefined и уронило бы весь раздел — не сломанной карточкой, а белым
   * экраном, потому что compareBrands получил бы undefined.
   */
  const resolveBrand = (name: string): string | null => {
    if (!brandsFile) return null;
    if (brandsFile.brands[name]) return name;
    const want = name.toUpperCase();
    return Object.keys(brandsFile.brands).find((k) => k.toUpperCase() === want) ?? null;
  };

  // ---- пермалинк дуэли (контракт §2/§4) ----
  const writeUrl = useUrlWriter();

  useUrlOnce((sp) => {
    // brand — «главная» марка, vs — до двух соперников. Разбираем обе формы,
    // потому что ссылка может прийти и из карточки, и из сравнения.
    const raw = [sp.get("brand"), ...(sp.get("vs") ?? "").split(",")]
      .map((x) => (x ?? "").trim())
      .filter(Boolean);
    if (raw.length) setSelected(raw.slice(0, 3).map((x) => x.toUpperCase()));
  });

  useEffect(() => {
    writeUrl({
      brand: selected[0] ?? null,
      vs: selected.length > 1 ? selected.slice(1).join(",") : null,
    });
  }, [selected, writeUrl]);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [showAll, setShowAll] = useState(false);
  // F2: сравнение только в рамках одного класса ТС (не сравниваем КАМАЗ с Toyota).
  const [brandClass, setBrandClass] = useState<string>("passenger_car");

  useEffect(() => {
    let alive = true;
    app.loadBrands().then((f) => alive && setBrandsFile(f)).catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Национальная таблица виновник/жертва — база для рейтинга и сравнений */
  const nationalRows = useMemo(() => app.national.culprits.brands, [app.national]);

  /** Полный список ВСЕХ марок из brands.json (376) — с виновником/жертвой/тяжестью. */
  const allBrands = useMemo<CulpritBrand[]>(() => {
    if (!brandsFile) return [];
    const rows: CulpritBrand[] = [];
    for (const [brand, d] of Object.entries(brandsFile.brands)) {
      rows.push({
        brand,
        culprit: d.culprit,
        victim: d.victim,
        total: d.total,
        aggr: d.total > 0 ? d.culprit / d.total : 0,
      });
    }
    return rows;
  }, [brandsFile]);

  const baselineShare = useMemo(() => {
    const src = allBrands.length ? allBrands : nationalRows;
    let c = 0, v = 0;
    for (const b of src) {
      c += b.culprit;
      v += b.victim;
    }
    return c + v > 0 ? c / (c + v) : 0.5;
  }, [allBrands, nationalRows]);

  // F2: фильтр марок по доминирующему классу ТС (не сравниваем КАМАЗ с Toyota).
  const classBrands = useMemo(() => {
    if (brandClass === "all" || !brandsFile) return allBrands;
    const map = app.dicts.cat_to_super ?? {};
    return allBrands.filter((b) => {
      const cat = brandsFile.brands[b.brand]?.cat;
      return cat ? map[cat] === brandClass : false;
    });
  }, [allBrands, brandClass, brandsFile, app.dicts]);

  // Research: при выборе региона — топ марок региона (охват из by_region).
  // Виновность/жертвы остаются национальными (per-region виновности в данных нет).
  const scopedBrands = useMemo(() => {
    if (app.scope === "ALL" || !brandsFile) return classBrands;
    const regionName = app.meta.regions.find((r) => r.slug === app.scope)?.name;
    if (!regionName) return classBrands;
    const kept = classBrands.filter((b) =>
      (brandsFile.brands[b.brand]?.by_region ?? []).some(([rn]) => rn === regionName)
    );
    // сортируем по ДТП марки внутри региона
    return kept;
  }, [app.scope, app.meta, brandsFile, classBrands]);

  const toggleBrand = (name: string) => {
    setSelected((s) =>
      s.includes(name) ? s.filter((x) => x !== name) : s.length >= 3 ? [...s.slice(1), name] : [...s, name],
    );
  };

  if (!brandsFile) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Загружаем детали по маркам…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Research-бар: регион + период (F2) — фильтрация как в Атласе.
          При выборе региона рейтинг/динамика марок показывают региональный срез,
          доступный из brands.json (by_region/by_year). Виновность per-region
          в данных нет — она остаётся национальной, это честно помечено. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResearchBar />
        <span className="text-[11px] text-slate-600">
          {app.scope === "ALL"
            ? "рейтинг — по всему периоду · период смотрит на профиль марки"
            : "доля виновника — по РФ, охват марки — по региону"}
        </span>
      </div>
      {/* Вердикт стоит ПЕРВЫМ в DOM, выше выбора.
          Раньше над ним всегда была карточка с полем ввода, и на телефоне
          результат уезжал под сгиб ровно в тот момент, когда человек его
          получил. Теперь выбор уходит вниз, как только сравнение собрано:
          менять марки нужно редко, а читать результат — сразу. */}
      {(() => {
        // Одна марка — тоже полноценный сценарий: досье против автопарка.
        // Раньше без второй марки не показывалось вообще ничего.
        const keys = selected.map(resolveBrand).filter(Boolean) as string[];
        if (keys.length === 0) return null;
        return (
          <div ref={compareRef} className="scroll-mt-28">
            <BrandVerdictCard
              brandsFile={brandsFile}
              names={keys.slice(0, 2)}
              onAddSecond={() => setOpenPicker((n) => n + 1)}
            />
          </div>
        );
      })()}

      <Section
        title={selected.length >= 2 ? "Изменить выбор" : selected.length === 1 ? "Добавить вторую марку" : "Марки в ДТП"}
        lead={
          selected.length === 0
            ? "Выбери марку — покажем, чем она отличается от среднего по автопарку. Добавь вторую, чтобы сравнить напрямую."
            : selected.length === 1
              ? "Выбери вторую марку, чтобы сравнить их между собой."
              : undefined
        }
        divider={selected.length >= 1}
      >
        <BrandPicker
          brandsFile={brandsFile}
          selected={selected}
          onChange={setSelected}
          onGoToCompare={() =>
            compareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          openSignal={openPicker}
        />
      </Section>

      {/* SearchResults и старая строка поиска в шапке убраны: это был
          дублирующий путь выбора марки — BrandPicker теперь единственная
          точка входа. Раньше SearchResults рисовался следом за вердиктом
          и занимал целый экран старыми карточками, из-за которых до
          кнопки «поделиться» приходилось листать. */}

      {selected.length === 0 && (
        <>
          <Section
            title="Рейтинг марок"
            lead={`Базовая доля виновников по автопарку — ${Math.round(baselineShare * 100)}%. Марка выше неё чаще оказывается виновной стороной.`}
            aside={
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1 rounded-lg bg-slate-800/70 p-1">
                  <button onClick={() => setShowAll(false)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${!showAll ? "text-white" : "text-slate-400 hover:text-slate-200"}`} style={!showAll ? { backgroundColor: "var(--accent)" } : undefined}>Топ-25</button>
                  <button onClick={() => setShowAll(true)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${showAll ? "text-white" : "text-slate-400 hover:text-slate-200"}`} style={showAll ? { backgroundColor: "var(--accent)" } : undefined}>Все марки</button>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  Класс ТС
                  <select
                    value={brandClass}
                    onChange={(e) => setBrandClass(e.target.value)}
                    className="rounded-md bg-slate-800/80 px-1.5 py-1 text-[11px] text-slate-200"
                  >
                    <option value="passenger_car">Легковые</option>
                    <option value="truck">Грузовые</option>
                    <option value="bus">Автобусы</option>
                    <option value="motorcycle">Мото</option>
                    <option value="all">Все классы</option>
                  </select>
                </label>
              </div>
            }
          >
            <RankingTable
              rows={scopedBrands}
              showAll={showAll}
              sortKey={sortKey}
              setSortKey={setSortKey}
              selected={selected}
              onToggle={toggleBrand}
            />
          </Section>
        </>
      )}

      {/* Старый CompareChart удалён: это и была «карточка внизу, которая
          не изменилась» — два одинаковых столбика с индексом агрессии.
          Его роль полностью закрывает BrandVerdictCard выше. */}

      <Section
        title="Марки в ДТП"
        lead={app.scope === "ALL" ? "Марка первого транспортного средства по всей России" : "Топ марок региона"}
      >
        <TopBrandsChart accent={theme.accentMain} allBrands={scopedBrands} />
      </Section>

      <Section
        title="Стаж и тяжесть"
        lead="Доля тяжёлых исходов растёт вместе со стажем, а не падает — база по стране 67,9%."
      >
        <ExperienceCharts />
      </Section>
    </div>
  );
}

function sortTitle(k: SortKey): string {
  return k === "total" ? "число ДТП" : k === "culpritShare" ? "доля виновника" : "агрессивность";
}


function SevDonut({ sev, total }: { sev: [number, number, number]; total: number }) {
  const option: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, left: "center", textStyle: { color: "#94a3b8", fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
      series: [{
        type: "pie", radius: ["48%", "70%"], center: ["50%", "42%"],
        label: { show: false },
        data: SEV_NAMES.map((n, i) => ({ name: n, value: sev[i], itemStyle: { color: SEV_COLORS[i] } })),
      }],
    }),
    [sev],
  );
  return (
    <div className="relative">
      <EChart option={option} height={150} />
      <div className="pointer-events-none absolute inset-x-0 top-[26%] text-center">
        <div className="text-xl font-bold text-white tabular-nums">{total.toLocaleString("ru-RU")}</div>
        <div className="text-[9px] uppercase tracking-widest text-slate-500">дтп</div>
      </div>
    </div>
  );
}

/** Динамика ДТП с маркой по годам. */
function YearTrend({ by_year, accent }: { by_year: [string, number][]; accent: string }) {
  const option: echarts.EChartsOption = useMemo(() => {
    const years = by_year.map(([y]) => y);
    const data = by_year.map(([, c]) => c);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 46, right: 20, top: 16, bottom: 26 },
      xAxis: { type: "category", data: years, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value" },
      series: [{
        type: "line", smooth: true, symbolSize: 5, data,
        lineStyle: { width: 2.5, color: accent },
        itemStyle: { color: accent },
        areaStyle: { color: "rgba(249,115,22,0.12)" },
      }],
    };
  }, [by_year, accent]);
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Динамика по годам</div>
      <EChart option={option} height={150} />
    </div>
  );
}

/** Гео-охват: топ регионов по числу ДТП с маркой. */
function RegionSpread({ by_region, accent }: { by_region: [string, number][]; accent: string }) {
  const option: echarts.EChartsOption = useMemo(() => {
    const names = by_region.map(([r]) => (r.length > 26 ? r.slice(0, 25) + "…" : r)).reverse();
    const data = by_region.map(([, c]) => c).reverse();
    return {
      tooltip: {},
      grid: { left: 140, right: 40, top: 8, bottom: 8 },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: names, axisLabel: { fontSize: 10 } },
      series: [{
        type: "bar", data,
        itemStyle: { color: accent, borderRadius: [0, 5, 5, 0] },
        label: { show: true, position: "right", color: "#94a3b8", fontSize: 10 },
      }],
    };
  }, [by_region, accent]);
  if (by_region.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Гео-охват · регионы</div>
      <EChart option={option} height={Math.max(120, by_region.length * 22)} />
    </div>
  );
}

/* ============================ рейтинг ============================ */
function RankingTable({
  rows,
  showAll,
  sortKey,
  setSortKey,
  selected,
  onToggle,
}: {
  rows: CulpritBrand[];
  showAll: boolean;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  selected: string[];
  onToggle: (n: string) => void;
}) {
  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortKey === "total") arr.sort((a, b) => b.total - a.total);
    if (sortKey === "aggr") arr.sort((a, b) => b.aggr - a.aggr);
    if (sortKey === "culpritShare")
      arr.sort((a, b) => b.culprit / (b.culprit + b.victim) - a.culprit / (a.culprit + a.victim));
    return showAll ? arr : arr.slice(0, 25);
  }, [rows, sortKey, showAll]);

  const th = (key: SortKey, label: string) => (
    <th
      onClick={() => setSortKey(key)}
      className={`cursor-pointer select-none px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide transition ${
        sortKey === key ? "text-orange-400" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {label} {sortKey === key ? "▾" : ""}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left">
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">#</th>
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Марка</th>
            {th("total", "ДТП")}
            <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Вин/Жерт</th>
            {th("culpritShare", "% вины")}
            {th("aggr", "Агрессия")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => {
            const share = b.culprit + b.victim > 0 ? b.culprit / (b.culprit + b.victim) : 0;
            const isSel = selected.includes(b.brand);
            return (
              <tr
                key={b.brand}
                onClick={() => onToggle(b.brand)}
                className={`cursor-pointer border-b border-slate-800/50 transition hover:bg-slate-800/40 ${
                  isSel ? "bg-orange-500/10" : ""
                }`}
              >
                <td className="px-2 py-1.5 text-xs text-slate-600">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium text-slate-200">
                  {isSel && <span className="mr-1 text-orange-400">●</span>}
                  {b.brand}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{b.total.toLocaleString("ru-RU")}</td>
                <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">
                  <span className="text-red-400">{b.culprit.toLocaleString("ru-RU")}</span>
                  {" / "}
                  <span className="text-sky-400">{b.victim.toLocaleString("ru-RU")}</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{(share * 100).toFixed(1)}%</td>
                <td className="px-2 py-1.5 text-right">
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
                    style={{
                      backgroundColor:
                        b.aggr >= 1.15 ? "rgba(239,68,68,.15)" : b.aggr <= 0.85 ? "rgba(52,211,153,.15)" : "rgba(148,163,184,.15)",
                      color: b.aggr >= 1.15 ? "#f87171" : b.aggr <= 0.85 ? "#34d399" : "#cbd5e1",
                    }}
                  >
                    {b.aggr.toFixed(2)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/* ============================ прежние блоки ============================ */
function TopBrandsChart({ accent, allBrands }: { accent: string; allBrands: CulpritBrand[] }) {
  const app = useApp();
  const [limit, setLimit] = useState<25 | 40 | "all">(40);
  const vehicles = useMemo(() => {
    if (app.scope !== "ALL" && app.regionFile) {
      const m = new Map<number, number>();
      for (const r of app.regionFile.rows) if (r[11] >= 0) m.set(r[11], (m.get(r[11]) ?? 0) + 1);
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([i, c]) => ({ name: app.dicts.brands[i] ?? "—", count: c }));
    }
    // национальный режим: берём полный список марок из brands.json
    const src = allBrands.length
      ? allBrands.map((b) => ({ name: b.brand, count: b.total }))
      : app.national.vehicles.top_brands.map((b) => ({ name: b.name, count: b.count }));
    const sorted = [...src].sort((a, b) => b.count - a.count);
    return (limit === "all" ? sorted : sorted.slice(0, limit));
  }, [app.scope, app.regionFile, app.dicts.brands, app.national, allBrands, limit]);

  const option: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      grid: { left: 130, right: 60, top: 8, bottom: 8 },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: vehicles.map((b) => b.name).reverse(), axisLabel: { fontSize: 11 } },
      series: [{
        type: "bar",
        data: vehicles.map((b) => b.count).reverse(),
        itemStyle: { color: accent, borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: "#94a3b8" },
      }],
    }),
    [vehicles, accent],
  );
  const height = limit === "all" ? Math.max(420, vehicles.length * 22) : 440;

  return (
    <div>
      {app.scope === "ALL" && (
        <div className="mb-2 flex gap-1">
          {([25, 40, "all"] as const).map((n) => (
            <button
              key={String(n)}
              onClick={() => setLimit(n)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                limit === n ? "text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
              style={limit === n ? { backgroundColor: "var(--accent)" } : undefined}
            >
              {n === "all" ? "Все" : `Топ-${n}`}
            </button>
          ))}
        </div>
      )}
      <EChart option={option} height={height} />
    </div>
  );
}

function ExperienceCharts() {
  const ex = useApp().national.experience;
  const expSevOption: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: "#94a3b8" } },
      grid: { left: 50, right: 24, top: 36, bottom: 40 },
      xAxis: { type: "category", data: ex.buckets, axisLabel: { interval: 0, fontSize: 10 } },
      yAxis: [{ type: "value" }, { type: "value", name: "% тяжёлых", max: 100 }],
      series: [
        {
          name: "ДТП с водителями этого стажа", type: "bar",
          data: ex.stats.map((s) => s.accidents),
          itemStyle: { color: "#38bdf8", borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "Доля тяжёлых исходов", type: "line", yAxisIndex: 1, smooth: true,
          data: ex.stats.map((s) => Math.round(s.severe_share * 100)),
          lineStyle: { width: 3, color: "#ef4444" }, itemStyle: { color: "#ef4444" },
        },
        {
          name: "Средний уровень", type: "line", yAxisIndex: 1,
          data: ex.buckets.map(() => Math.round(ex.baseline_severe_share * 100)),
          lineStyle: { type: "dashed", color: "#64748b" }, itemStyle: { color: "#64748b" },
        },
      ],
    }),
    [ex],
  );
  return <EChart option={expSevOption} height={420} />;
}
