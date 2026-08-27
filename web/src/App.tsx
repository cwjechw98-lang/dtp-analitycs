import { AnimatePresence, motion } from "framer-motion";
import { Suspense, lazy, useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { trackArrival, trackView } from "./lib/analytics";
import { humanDate } from "./lib/data";
import { useApp, useAppState } from "./state/AppState";
import { ProfileProvider } from "./state/ProfileContext";
import AuroraBackground from "./components/AuroraBackground";
import ProfileBar from "./components/ProfileBar";
import RegionHint from "./components/RegionHint";
import ThemeSettings from "./components/ThemeSettings";
import { BottomNav, DesktopNav } from "./components/Nav";

// Разделы грузятся лениво: ECharts и Leaflet весят больше мегабайта,
// и лендингу на "/" (этап 4) они не нужны вовсе.
const LauncherPage = lazy(() => import("./pages/LauncherPage"));
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

      {/* Тонкая шапка: идентика слева, служебное справа. Прежний блок
          с заголовком, подзаголовком и рядом крупных таблеток занимал
          четверть экрана телефона и конкурировал за внимание с вердиктом. */}
      <header
        className="sticky top-0 z-[900] border-b backdrop-blur-xl"
        style={{
          borderColor: "var(--border)",
          background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
            <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--heading)" }}>
              ДТП Аналитика
            </span>
          </div>

          <DesktopNav />

          <div className="ml-auto flex items-center gap-2">
            {app.regionLoading && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500" />
            )}
            <ProfileBar />
            <ThemeSettings />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-5 sm:px-6 md:pb-10">
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
              {/* Launcher: настоящая публичная входная точка. Раньше здесь
                  стоял редирект на /route, и человек из Threads попадал
                  прямо в пустую форму «введите А и Б». */}
              <Route path="/" element={<LauncherPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />

      <footer className="mx-auto max-w-6xl px-4 pb-24 text-center text-xs sm:px-6 md:pb-6" style={{ color: "var(--muted)" }}>
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
