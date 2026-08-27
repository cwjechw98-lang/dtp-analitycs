import { AnimatePresence, motion } from "framer-motion";
import { Suspense, lazy, useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { trackArrival, trackView } from "./lib/analytics";
import { humanDate } from "./lib/data";
import { nf } from "./lib/format";
import { useApp, useAppState } from "./state/AppState";
import { ProfileProvider } from "./state/ProfileContext";
import AuroraBackground from "./components/AuroraBackground";
import ProfileBar from "./components/ProfileBar";
import RegionHint from "./components/RegionHint";
import ThemeSettings from "./components/ThemeSettings";

// Разделы грузятся лениво: ECharts и Leaflet весят больше мегабайта,
// и лендингу на "/" (этап 4) они не нужны вовсе.
const RoutePage = lazy(() => import("./pages/RoutePage"));
const AtlasPage = lazy(() => import("./pages/AtlasPage"));
const FleetPage = lazy(() => import("./pages/FleetPage"));
const MePage = lazy(() => import("./pages/MePage"));

function SectionFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500" />
    </div>
  );
}

/**
 * Три раздела вместо шести вкладок (контракт §5).
 *
 * Прежняя нарезка шла по измерениям датасета — Обзор / Время / Карта / Авто.
 * Новая идёт по вопросу пользователя: куда я еду, как устроена аварийность,
 * что за марка. Советы растворились в разделах, где они применимы.
 */
const SECTIONS = [
  { to: "/route", label: "Маршрут", icon: "🧭", hint: "Что было на дороге, по которой я поеду" },
  { to: "/atlas", label: "Атлас", icon: "🗺️", hint: "Как устроена аварийность в стране и регионе" },
  { to: "/fleet", label: "Автопарк", icon: "🚙", hint: "Марки, виновники, стаж" },
  { to: "/me", label: "Мой риск", icon: "🎯", hint: "Личный профиль относительно базы" },
] as const;

function RegionSummary() {
  const app = useApp();
  const regionName =
    app.scope === "ALL"
      ? app.meta.coverage
      : app.meta.regions.find((r) => r.slug === app.scope)?.name ?? app.scope;
  const total = app.scope === "ALL" ? app.meta.total_accidents : app.regionFile?.total ?? 0;
  const period =
    app.scope === "ALL"
      ? `${app.meta.date_min} — ${app.meta.date_max}`
      : `${app.regionFile?.date_min ?? "…"} — ${app.regionFile?.date_max ?? "…"}`;

  return (
    <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
      {regionName} · {nf.format(total)} происшествий{period ? ` · ${period}` : ""}
    </p>
  );
}

function Shell() {
  const app = useApp();
  const location = useLocation();

  useEffect(() => {
    trackView(location.pathname.replace(/^\//, "") || "root");
  }, [location.pathname]);

  useEffect(() => {
    trackArrival();
  }, []);

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
            <RegionSummary />
          </motion.div>
          <div className="flex items-center gap-2.5">
            {app.regionLoading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500" />
            )}
            <ProfileBar />
            <ThemeSettings />
          </div>
        </div>

        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1 pb-px">
            {SECTIONS.map((s) => (
              <NavLink
                key={s.to}
                to={{ pathname: s.to, search: location.search }}
                title={s.hint}
                className={({ isActive }) =>
                  `relative whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
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
                    <span className="relative mr-1.5">{s.icon}</span>
                    <span className="relative">{s.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        <RegionHint />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <Suspense fallback={<SectionFallback />}>
            <Routes location={location}>
              <Route path="/route" element={<RoutePage />} />
              <Route path="/atlas" element={<AtlasPage />} />
              <Route path="/fleet" element={<FleetPage />} />
              <Route path="/me" element={<MePage />} />
              {/* Лендинг придёт на "/" на этапе 4; до тех пор — вход в маршрут. */}
              <Route path="*" element={<Navigate to="/route" replace />} />
            </Routes>
            </Suspense>
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
        · ГИБДД МВД России · обновлено {humanDate(app.meta.generated_at_utc)}. Оценки вероятностные и
        построены на исторических данных: это не правовые выводы и не гарантия безопасности.
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ProfileProvider>
      <Gate />
    </ProfileProvider>
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
