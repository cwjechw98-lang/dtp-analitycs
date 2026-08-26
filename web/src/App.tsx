import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { humanDate } from "./lib/data";
import { nf } from "./lib/format";
import { AppStateProvider, useApp, useAppState } from "./state/AppState";
import { ACCENTS, ThemeProvider, useTheme, type AccentId } from "./state/ThemeContext";
import AuroraBackground from "./components/AuroraBackground";
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

function RegionSelector() {
  const { meta, scope, setScope } = useApp();
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span className="hidden sm:inline">Регион:</span>
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        className="max-w-[240px] rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-100 outline-none transition hover:border-slate-500 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20"
      >
        <option value="ALL">
          🇷🇺 Вся Россия · {nf.format(meta.total_accidents)} ДТП
        </option>
        {meta.regions.map((r) => (
          <option key={r.slug} value={r.slug}>
            {r.name} · {nf.format(r.total)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThemeSettings() {
  const { mode, setMode, accent, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Тема и цветовая схема"
        className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-2.5 py-2 text-sm transition hover:border-slate-500"
      >
        🎨
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass absolute right-0 top-11 z-[1000] w-56 rounded-2xl border p-3 shadow-xl"
        >
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Тема</div>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {(["dark", "light"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                  mode === m ? "text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                style={mode === m ? { backgroundColor: "var(--accent)" } : undefined}
              >
                {m === "dark" ? "🌙 Тёмная" : "☀️ Светлая"}
              </button>
            ))}
          </div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Цветовая схема</div>
          <div className="flex gap-2">
            {(Object.keys(ACCENTS) as AccentId[]).map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                title={ACCENTS[a].name}
                className={`h-7 w-7 rounded-full transition ${
                  accent === a ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : "opacity-70 hover:opacity-100"
                }`}
                style={{ background: `linear-gradient(135deg, ${ACCENTS[a].main}, ${ACCENTS[a].soft})` }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Shell() {
  const app = useApp();
  const theme = useTheme();
  const [tab, setTab] = useState<TabId>("overview");

  const regionName =
    app.scope === "ALL"
      ? app.meta.coverage
      : app.meta.regions.find((r) => r.slug === app.scope)?.name ?? app.scope;
  const total = app.scope === "ALL" ? app.meta.total_accidents : (app.regionFile?.total ?? 0);
  const period =
    app.scope === "ALL"
      ? `${app.meta.date_min} — ${app.meta.date_max}`
      : `${app.regionFile?.date_min ?? "…"} — ${app.regionFile?.date_max ?? "…"}`;

  return (
    <div className="min-h-screen pb-14">
      <AuroraBackground />

      <header className="app-header sticky top-0 z-[900] border-b backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
              <span className="mr-1.5">🚗</span>
              ДТП Аналитика
            </h1>
            <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
              {regionName} · {nf.format(total)} происшествий{period ? ` · ${period}` : ""}
            </p>
          </motion.div>
          <div className="flex items-center gap-2.5">
            {app.regionLoading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500" />
            )}
            <RegionSelector />
            <ThemeSettings />
          </div>
        </div>
        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1 pb-px">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.id ? "text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-t-xl ring-1 ring-inset"
                    style={{
                      background:
                        "linear-gradient(to bottom, color-mix(in srgb, var(--accent) 26%, transparent), transparent)",
                      boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--accent) 45%, transparent)",
                      // @ts-expect-error css custom prop
                      "--tw-ring-color": "color-mix(in srgb, var(--accent) 35%, transparent)",
                    }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative mr-1.5">{t.icon}</span>
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab + "::" + app.scope}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "overview" && <OverviewTab />}
            {tab === "time" && <TimeTab />}
            {tab === "map" && <MapTab />}
            {tab === "route" && <RouteTab />}
            {tab === "fleet" && <FleetTab />}
            {tab === "tips" && <TipsTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-600 sm:px-6">
        Данные:{" "}
        <a
          href={app.meta.source_page}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:text-slate-400"
        >
          Карта ДТП (dtp-stat.ru/opendata)
        </a>{" "}
        · ГИБДД МВД России · обновлено {humanDate(app.meta.generated_at_utc)}. Рекомендации
        вероятностные и не заменяют ПДД.
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppStateProvider>
        <Gate />
      </AppStateProvider>
    </ThemeProvider>
  );
}

function Gate() {
  const st = useAppState();
  if (st && st.error && !st.ready) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="mt-3 text-lg font-semibold text-white">Не удалось загрузить данные</h1>
        <p className="mt-2 text-sm text-slate-400">{st.error}</p>
        <button
          className="mt-5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          onClick={() => location.reload()}
        >
          Попробовать снова
        </button>
      </div>
    );
  }
  if (!st || !st.ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          className="h-11 w-11 rounded-full border-2 border-slate-700 border-t-orange-500"
        />
        <motion.p
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
          className="text-sm text-slate-400"
        >
          Загружаем статистику по всей России…
        </motion.p>
      </div>
    );
  }
  return <Shell />;
}
