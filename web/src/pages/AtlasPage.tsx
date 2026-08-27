import { useEffect, useRef, useState } from "react";
import OverviewTab from "../components/OverviewTab";
import TimeTab from "../components/TimeTab";
import MapTab from "../components/MapTab";
import { useApp } from "../state/AppState";

/**
 * Раздел «Атлас» — слияние прежних вкладок Обзор + Время + Карта
 * (контракт §5).
 *
 * Все три работали на одном и том же `scope`, поэтому разделение между ними
 * было искусственным: чтобы посмотреть «в моём регионе, летом, вечером»,
 * приходилось прыгать между вкладками, удерживая фильтр в голове.
 * Теперь это одна прокручиваемая страница с якорями.
 *
 * Внутренности OverviewTab / TimeTab / MapTab не изменены ни на строку —
 * они просто стоят друг под другом.
 */

const ANCHORS = [
  { id: "overview", label: "Обзор", hint: "Годы, категории, тяжесть, погода" },
  { id: "time", label: "Время", hint: "Часы, дни недели, сезоны" },
  { id: "map", label: "Карта", hint: "Где именно" },
] as const;

type AnchorId = (typeof ANCHORS)[number]["id"];

export default function AtlasPage() {
  const app = useApp();
  const [active, setActive] = useState<AnchorId>("overview");
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // Подсветка текущего якоря при прокрутке. Порог 45% высоты экрана —
  // секция считается активной, когда занимает верхнюю половину вьюпорта.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id as AnchorId);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    for (const a of ANCHORS) {
      const el = refs.current[a.id];
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  const jump = (id: AnchorId) => {
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4">
      {/* Якорная навигация: раздел длинный, без неё в нём теряешься. */}
      <div className="sticky top-[104px] z-[850] -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
        {ANCHORS.map((a) => (
          <button
            key={a.id}
            onClick={() => jump(a.id)}
            title={a.hint}
            className={`glass whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              active === a.id
                ? "border-transparent text-white"
                : "border-slate-800/80 text-slate-400 hover:text-slate-200"
            }`}
            style={
              active === a.id
                ? { backgroundColor: "color-mix(in srgb, var(--accent) 26%, transparent)" }
                : undefined
            }
          >
            {a.label}
          </button>
        ))}
      </div>

      <section
        id="overview"
        ref={(el) => {
          refs.current.overview = el;
        }}
        className="scroll-mt-[150px] space-y-4"
      >
        <OverviewTab />
      </section>

      <section
        id="time"
        ref={(el) => {
          refs.current.time = el;
        }}
        className="scroll-mt-[150px] space-y-4"
      >
        <TimeTab />
      </section>

      <section
        id="map"
        ref={(el) => {
          refs.current.map = el;
        }}
        className="scroll-mt-[150px] space-y-4"
      >
        {app.scope === "ALL" ? (
          <MapTab />
        ) : (
          // MapTab в режиме региона требует загруженного regionFile;
          // пока он грузится, показываем плашку вместо пустой карточки.
          <MapTab key={app.scope} />
        )}
      </section>
    </div>
  );
}
