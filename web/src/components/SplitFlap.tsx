import { useEffect, useRef, useState } from "react";

/**
 * Split-flap табло (как в аэропортах) — «перелистывающиеся» цифры.
 * Для статистики исследований: когда значение меняется (фильтры/сборка),
 * цифры механически прокручиваются. Без внешних зависимостей.
 */

const CHARS = "0123456789";

function FlipChar({ ch }: { ch: string }) {
  const [current, setCurrent] = useState(ch);
  const [flipping, setFlipping] = useState(false);
  const prev = useRef(ch);

  useEffect(() => {
    if (ch === current) return;
    prev.current = current;
    setFlipping(true);
    const t = setTimeout(() => { setCurrent(ch); setFlipping(false); }, 260);
    return () => clearTimeout(t);
  }, [ch, current]);

  return (
    <span className={`sf-char ${flipping ? "sf-flip" : ""}`} data-ch={current}>
      <span className="sf-top">{flipping ? prev.current : current}</span>
      <span className="sf-bottom">{current}</span>
    </span>
  );
}

/** Разбивает число на символы (тысячи — с точками-разделителями через nbsp). */
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
    <div className={`sf-board ${className}`} style={accent ? { "--sf-accent": accent } as React.CSSProperties : undefined}>
      <div className="sf-digits" aria-hidden="false">
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
