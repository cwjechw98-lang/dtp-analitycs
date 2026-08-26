import { useState } from "react";
import { humanDate, useDatasets } from "./lib/data";
import OverviewTab from "./components/OverviewTab";
import TimeTab from "./components/TimeTab";
import MapTab from "./components/MapTab";
import RouteTab from "./components/RouteTab";
import FleetTab from "./components/FleetTab";
import TipsTab from "./components/TipsTab";

const TABS = [
  { id: "overview", label: "Обзор", icon: "📊" },
  { id: "time", label: "Время", icon: "🕒" },
  { id: "map", label: "Карта", icon: "🗺️" },
  { id: "route", label: "Маршрут", icon: "🧭" },
  { id: "fleet", label: "Авто и водители", icon: "🚙" },
  { id: "tips", label: "Советы", icon: "💡" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const { data, error, step } = useDatasets();
  const [tab, setTab] = useState<TabId>("overview");

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="mt-3 text-lg font-semibold text-white">Не удалось загрузить данные</h1>
        <p className="mt-2 text-sm text-slate-400">{error}</p>
        <button
          className="mt-5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          onClick={() => location.reload()}
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500" />
        <p className="text-sm text-slate-400">{step}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      {/* Шапка */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-[#0b1220] via-[#101a30] to-[#0b1220]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">
              🚗 ДТП Аналитика <span className="text-orange-400">· Омская область</span>
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              {data.meta.total_accidents.toLocaleString("ru-RU")} происшествий за{" "}
              {data.meta.date_min} — {data.meta.date_max} · данные dtp-stat.ru от{" "}
              {humanDate(data.meta.generated_at_utc)}
            </p>
          </div>
          <a
            href={data.meta.opendata_page}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-orange-500 hover:text-orange-300"
          >
            Источник данных ↗
          </a>
        </div>
        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1 pb-px">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  tab === t.id
                    ? "border-orange-500 bg-slate-900/60 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="mr-1.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "time" && <TimeTab data={data} />}
        {tab === "map" && <MapTab data={data} />}
        {tab === "route" && <RouteTab data={data} />}
        {tab === "fleet" && <FleetTab data={data} />}
        {tab === "tips" && <TipsTab data={data} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-600 sm:px-6">
        Данные:{" "}
        <a href={data.meta.opendata_page} target="_blank" rel="noreferrer" className="underline hover:text-slate-400">
          Карта ДТП (dtp-stat.ru/opendata)
        </a>{" "}
        · ГИБДД МВД России. Рекомендации носят вероятностный характер и не заменяют ПДД.
      </footer>
    </div>
  );
}
