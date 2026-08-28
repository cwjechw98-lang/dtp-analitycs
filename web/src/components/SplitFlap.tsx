import { useEffect, useRef, useState } from "react";

/**
 * Split-flap табло (как в аэропортах) — «перелистывающиеся» цифры.
 * Без внешних зависимостей. Оптимизировано по советам GLM-5.3 (max effort):
 *  - CSS-анимации + contain: content (без пере-рендеров на кадр)
 *  - доступность: aria-hidden на декоративных flap, одно aria-live на ряд
 *  - edge-case: пропуск одинаковых символов, мгновенный переход при burst-смене
 */

const CHARS = "0123456789";

function FlipChar({ ch }: { ch: string }) {
  const [current, setCurrent] = useState(ch);
  const [flipping, setFlipping] = useState(false);
  const prev = useRef(ch);

  useEffect(() => {
    if (ch === current) return; // одинаковый символ — не крутим впустую
    prev.current = current;
    setFlipping(true);
    const t = setTimeout(() => { setCurrent(ch); setFlipping(false); }, 240);
    return () => clearTimeout(t);
  }, [ch, current]);

  return (
    <span className={`sf-char ${flipping ? "sf-flip" : ""}`} data-ch={current} aria-hidden="true">
      <span className="sf-top">{flipping ? prev.current : current}</span>
      <span className="sf-bottom">{current}</span>
    </span>
  );
}

/** Разбивает число на символы (тысячи — с точками-разделителями). */
function splitNum(n: number | string): string[] {
  return n.toLocaleString("ru-RU").split("");
}

/**
 * Табло для числа: переключает цифры "в стиле самолётного табло".
 * `value` — число; `label` — подпись; `accent` — цвет (css-переменная).
 */
export default function SplitFlap({
  value,
  label,
  accent,
  className = "",
}: {
  value: number | string;
  label?: string;
  accent?: string;
  className?: string;
}) {
  const chars = splitNum(value);
  return (
    <div
      className={`sf-board ${className}`}
      style={accent ? { "--sf-accent": accent } as React.CSSProperties : undefined}
      role="timer"
      aria-label={`${label ? label + ": " : ""}${value.toLocaleString("ru-RU")}`}
    >
      <div className="sf-digits" aria-hidden="true">
        {chars.map((c, i) =>
          c === " " || c === "," ? (
            <span key={i} className="sf-sep">{c}</span>
          ) : (
            <FlipChar key={i} ch={c} />
          )
        )}
      </div>
      {label && <div className="sf-label">{label}</div>}
    </div>
  );
}
