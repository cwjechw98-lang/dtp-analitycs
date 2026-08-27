import { useEffect, useMemo, useRef, useState } from "react";
import ShareButton from "./ShareButton";
import { useUrlOnce, useUrlWriter } from "../hooks/useUrlSync";
import { motion } from "framer-motion";
import { useApp } from "../state/AppState";
import { useTheme } from "../state/ThemeContext";
import type { BrandDetail, BrandsFile, CulpritBrand } from "../lib/types";
import EChart from "./EChart";
import { Badge, Card } from "./ui";
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
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

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
    <div className="space-y-4">
      <Card
        title="🔍 Эксплорер автопрома"
        subtitle="Живой инструмент: ищи любую марку, проваливайся в детали, сравнивай до трёх брендов друг с другом"
      >
        <div className="space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Введите марку: BMW, БМВ, Toyota, ВАЗ, Audi…"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20"
          />
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Сравнение:</span>
              {selected.map((name) => (
                <button
                  key={name}
                  onClick={() => toggleBrand(name)}
                  className="group flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent) 16%, transparent)",
                    color: "var(--accent)",
                    // @ts-expect-error css var
                    "--tw-ring-color": "color-mix(in srgb, var(--accent) 45%, transparent)",
                  }}
                >
                  {name}
                  <span className="opacity-50 group-hover:opacity-100">✕</span>
                </button>
              ))}
              <button onClick={() => setSelected([])} className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-300">
                очистить
              </button>
              <ShareButton
                path="/fleet"
                params={{ brand: selected[0], vs: selected.slice(1).join(",") || null }}
                title={
                  selected.length > 1
                    ? `${selected.join(" × ")} — кто чаще виноват`
                    : `${selected[0]} — статистика ДТП`
                }
                label={selected.length > 1 ? "Поделиться дуэлью" : "Поделиться"}
                className="ml-auto"
              />
            </div>
          )}
        </div>
      </Card>

      {/* ---- результаты поиска / выбранные марки ---- */}
      <SearchResults
        query={query}
        brandsFile={brandsFile}
        nationalRows={allBrands}
        baselineShare={baselineShare}
        selected={selected}
        onToggle={toggleBrand}
        accentMain={theme.accentMain}
      />

      {selected.length === 0 && query.trim().length === 0 && (
        <>
          <Card
            title="Рейтинг марок"
            subtitle={`Кликни на марку, чтобы добавить к сравнению · сортировка: ${sortTitle(sortKey)} · базовая доля виновников ${Math.round(baselineShare * 100)}%`}
            aside={
              <div className="flex gap-1 rounded-lg bg-slate-800/70 p-1">
                <button onClick={() => setShowAll(false)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${!showAll ? "text-white" : "text-slate-400 hover:text-slate-200"}`} style={!showAll ? { backgroundColor: "var(--accent)" } : undefined}>Топ-25</button>
                <button onClick={() => setShowAll(true)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${showAll ? "text-white" : "text-slate-400 hover:text-slate-200"}`} style={showAll ? { backgroundColor: "var(--accent)" } : undefined}>Все марки</button>
              </div>
            }
          >
            <RankingTable
              rows={allBrands}
              showAll={showAll}
              sortKey={sortKey}
              setSortKey={setSortKey}
              selected={selected}
              onToggle={toggleBrand}
            />
          </Card>
        </>
      )}

      {selected.length >= 2 && (
        <CompareChart selected={selected} rows={allBrands} brandsFile={brandsFile} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Марки автомобилей в ДТП" subtitle={app.scope === "ALL" ? "Марки первого ТС" : "Топ марок региона"}>
          <TopBrandsChart accent={theme.accentMain} allBrands={allBrands} />
        </Card>
        <Card title="Стаж вождения и тяжесть ДТП" subtitle="Национальные данные">
          <ExperienceCharts />
        </Card>
      </div>
    </div>
  );
}

function sortTitle(k: SortKey): string {
  return k === "total" ? "число ДТП" : k === "culpritShare" ? "доля виновника" : "агрессивность";
}

/* ============================ поиск ============================ */
function SearchResults({
  query,
  brandsFile,
  nationalRows,
  baselineShare,
  selected,
  onToggle,
  accentMain,
}: {
  query: string;
  brandsFile: BrandsFile;
  nationalRows: CulpritBrand[];
  baselineShare: number;
  selected: string[];
  onToggle: (n: string) => void;
  accentMain: string;
}) {
  const q = query.trim().toUpperCase();
  if (!q) return null;

  const aliasTarget = ALIASES[q];
  const natByName = new Map(nationalRows.map((b) => [b.brand, b]));
  const matches = Object.keys(brandsFile.brands)
    .filter((name) => name.toUpperCase().includes(q) || (aliasTarget && name.toUpperCase() === aliasTarget))
    .sort((a, b) => (natByName.get(b)?.total ?? 0) - (natByName.get(a)?.total ?? 0));

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {matches.length === 0 && (
        <p className="col-span-full rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
          Марка «{query}» не найдена. Попробуй латиницу: BMW, TOYOTA, KIA…
        </p>
      )}
      {matches.slice(0, 6).map((name) => (
        <BrandCard
          key={name}
          name={name}
          detail={brandsFile.brands[name]}
          nationalRow={natByName.get(name)}
          baselineShare={baselineShare}
          isSelected={selected.includes(name)}
          onToggle={() => onToggle(name)}
          accentMain={accentMain}
        />
      ))}
    </div>
  );
}

/* ============================ карточка марки ============================ */
function BrandCard({
  name,
  detail,
  nationalRow,
  baselineShare,
  isSelected,
  onToggle,
  accentMain,
}: {
  name: string;
  detail: BrandDetail;
  nationalRow?: CulpritBrand;
  baselineShare: number;
  isSelected: boolean;
  onToggle: () => void;
  accentMain: string;
}) {
  const culprit = nationalRow?.culprit ?? detail.culprit;
  const victim = nationalRow?.victim ?? detail.victim;
  const share = culprit + victim > 0 ? culprit / (culprit + victim) : 0.5;
  const ratio = baselineShare > 0 ? share / baselineShare : 1;
  const verdict =
    ratio >= 1.25
      ? { text: `чаще виновник в ${ratio.toFixed(2)}× к среднему`, tone: "red" as const }
      : ratio <= 0.85
        ? { text: `реже виновник — ×${ratio.toFixed(2)} к среднему`, tone: "green" as const }
        : { text: `на уровне среднего (×${ratio.toFixed(2)})`, tone: "slate" as const };
  const totalSev = detail.sev[0] + detail.sev[1] + detail.sev[2];

  return (
    <motion.div layout>
      <Card
        className={`h-full ${isSelected ? "glow-ring" : ""}`}
        title={
          <span className="flex items-center gap-2">
            🚘 {name}
            <Badge tone={verdict.tone}>{verdict.text}</Badge>
          </span>
        }
        subtitle={`${(detail.total).toLocaleString("ru-RU")} записей с этой маркой`}
      >
        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-red-500/10 p-2">
            <div className="text-lg font-bold text-red-300">{culprit.toLocaleString("ru-RU")}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">виновник</div>
          </div>
          <div className="rounded-lg bg-sky-500/10 p-2">
            <div className="text-lg font-bold text-sky-300">{victim.toLocaleString("ru-RU")}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">жертва</div>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: `color-mix(in srgb, ${accentMain} 12%, transparent)` }}>
            <div className="text-lg font-bold" style={{ color: accentMain }}>{ratio.toFixed(2)}×</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">индекс агрессии</div>
          </div>
        </div>

        <SevDonut sev={detail.sev} total={totalSev} />

        {(detail.by_year?.length ?? 0) > 1 && <YearTrend by_year={detail.by_year} accent={accentMain} />}

        {(detail.by_region?.length ?? 0) > 0 && <RegionSpread by_region={detail.by_region} accent={accentMain} />}

        {detail.violations.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Топ-нарушения водителей</div>
            {detail.violations.slice(0, 3).map(([t, c]) => (
              <div key={t} className="flex items-baseline justify-between gap-2 rounded-md bg-slate-800/40 px-2 py-1 text-[11px]">
                <span className="leading-snug text-slate-300">{t}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{c.toLocaleString("ru-RU")}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onToggle}
          className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-medium transition ${
            isSelected ? "text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
          }`}
          style={isSelected ? { backgroundColor: accentMain } : undefined}
        >
          {isSelected ? "✓ в сравнении" : "+ добавить к сравнению"}
        </button>
      </Card>
    </motion.div>
  );
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

/* ============================ сравнение ============================ */
function CompareChart({
  selected,
  rows,
  brandsFile,
}: {
  selected: string[];
  rows: CulpritBrand[];
  brandsFile: BrandsFile;
}) {
  const byName = new Map(rows.map((r) => [r.brand, r]));
  const palette = ["#ef4444", "#38bdf8", "#34d399"];

  const option: echarts.EChartsOption = useMemo(() => {
    const names = selected;
    const aggr = names.map((n) => byName.get(n)?.aggr ?? 0);
    const shares = names.map((n) => {
      const r = byName.get(n);
      return r && r.culprit + r.victim > 0 ? Math.round((r.culprit / (r.culprit + r.victim)) * 100) : 0;
    });
    const totals = names.map((n) => byName.get(n)?.total ?? 0);
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: "#94a3b8" } },
      grid: { left: 50, right: 50, top: 56, bottom: 30 },
      xAxis: { type: "category", data: names, axisLabel: { fontWeight: "bold" as const } },
      yAxis: [
        { type: "value", name: "агрессия ×" },
        { type: "value", name: "% вины / ДТП", max: 100 },
      ],
      series: [
        {
          name: "Индекс агрессии", type: "bar", data: aggr, barWidth: 26,
          itemStyle: { borderRadius: [6, 6, 0, 0], color: "#fb923c" },
          label: { show: true, position: "top", color: "#94a3b8", formatter: (p: unknown) => `${(p as { value: number }).value.toFixed(2)}×` },
        },
        {
          name: "Доля вины, %", type: "bar", yAxisIndex: 1, data: shares, barWidth: 26,
          itemStyle: { borderRadius: [6, 6, 0, 0], color: "#ef4444aa" },
        },
        {
          name: "Всего ДТП", type: "line", yAxisIndex: 1, smooth: true,
          data: totals, lineStyle: { width: 2, type: "dashed", color: "#38bdf8" }, itemStyle: { color: "#38bdf8" },
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join("|"), rows]);

  const sevRows = selected.map((n) => ({ n, d: brandsFile.brands[n] }));

  return (
    <Card title="⚔️ Сравнение марок" subtitle="Индекс агрессии = доля виновника марки относительно доли виновника в среднем по автопарку">
      <EChart option={option} height={320} />
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {sevRows.map(({ n, d }, i) =>
          d ? (
            <div key={n} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-200">
                <span className="h-2 w-2 rounded-full" style={{ background: palette[i % 3] }} />
                {n}
              </div>
              <div className="space-y-0.5 text-slate-400">
                {(d.sev).map((v, j) => (
                  <div key={j} className="flex justify-between">
                    <span style={{ color: SEV_COLORS[j] }}>{SEV_NAMES[j]}</span>
                    <span className="tabular-nums">{d.total > 0 ? Math.round((v / d.total) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </Card>
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
