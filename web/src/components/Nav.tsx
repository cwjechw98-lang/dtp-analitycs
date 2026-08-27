import { NavLink, useLocation } from "react-router-dom";

/**
 * Навигация разделов.
 *
 * Прежние pill-таблетки в шапке были самым «дашбордным» элементом всего
 * приложения: четыре крупные кнопки конкурировали за внимание с
 * содержимым, ради которого человек пришёл.
 *
 * На телефоне — нижняя панель, как в приложении: большой палец достаёт
 * без перехвата, и верх экрана освобождается под вердикт.
 * На десктопе — спокойная горизонтальная строка без заливок.
 *
 * Отдельная забота — Telegram WebView: у него снизу своя полоса, поэтому
 * панель поднимается на safe-area-inset, иначе последний пункт уезжает
 * под системный элемент и по нему невозможно попасть.
 */

export const SECTIONS = [
  { to: "/route", label: "Маршрут", glyph: "◈" },
  { to: "/atlas", label: "Атлас", glyph: "▦" },
  { to: "/fleet", label: "Марки", glyph: "◉" },
  { to: "/me", label: "Профиль", glyph: "◐" },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[950] border-t backdrop-blur-xl md:hidden"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="mx-auto flex max-w-md">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={{ pathname: s.to, search: location.search }}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5"
          >
            {({ isActive }) => (
              <>
                <span
                  className="text-base leading-none transition-colors"
                  style={{ color: isActive ? "var(--accent)" : "var(--muted)" }}
                >
                  {s.glyph}
                </span>
                <span
                  className="text-[10px] font-medium tracking-wide transition-colors"
                  style={{ color: isActive ? "var(--heading)" : "var(--muted)" }}
                >
                  {s.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function DesktopNav() {
  const location = useLocation();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {SECTIONS.map((s) => (
        <NavLink
          key={s.to}
          to={{ pathname: s.to, search: location.search }}
          className="rounded-lg px-3 py-1.5 text-sm transition-colors"
          style={({ isActive }) =>
            isActive
              ? { color: "var(--heading)", fontWeight: 600 }
              : { color: "var(--muted)" }
          }
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
  );
}
