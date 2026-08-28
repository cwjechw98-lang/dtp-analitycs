import { useEffect, useRef, useState } from "react";

/**
 * Split-flap табло (как в аэропортах) — «перелистывающиеся» цифры.
 * Без внешних зависимостей. Оптимизировано по советам GLM-5.3 (max effort):
 *  - CSS-анимации + contain: content (без пере-рендеров на кадр)
 *  - доступность: aria-hidden на декоративных flap, одно aria-live на ряд
 *  - edge-case: пропуск одинаковых символов, мгновенный переход при burst-смене
 *
 * Count-up (по фидбеку): цифры крутятся от 0 до значения, когда блок
 * появляется в вьюпорте (IntersectionObserver), и от текущего к новому
 * при смене фильтров — как механическое табло.
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
    const t = setTimeout(() => { setCurrent(ch); setFlipping(false); }, 160);
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
function splitNum(n: number): string[] {
  return n.toLocaleString("ru-RU").split("");
}

/** ease-out cubic — табло крутится быстро в начале и замедляется к концу. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Табло для числа: count-up от 0 при появлении во вьюпорте,
 * от текущего к новому при смене value. `label` — подпись.
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
  const numeric = typeof value === "number" ? value : parseFloat(String(value).replace(/\s/g, "")) || 0;
  const [displayed, setDisplayed] = useState(0);
  const [visible, setVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const displayedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // старт анимации, когда блок реально виден (скролл)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          ob.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  // count-up: 0 → value при первом появлении; displayed → value при смене
  useEffect(() => {
    if (!visible) return;
    const from = started.current ? displayedRef.current : 0;
    const to = numeric;
    if (from === to) { setDisplayed(to); return; }
    started.current = true;

    const dur = from === 0 && to > 0 ? 1400 : 700; // первичный длиннее, смена — быстрее
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const v = Math.round(from + (to - from) * easeOutCubic(t));
      displayedRef.current = v;
      setDisplayed(v);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [numeric, visible]);

  // держим ref в актуальном состоянии
  useEffect(() => { displayedRef.current = displayed; }, [displayed]);

  const chars = splitNum(displayed);

  return (
    <div
      ref={wrapRef}
      className={`sf-board ${className}`}
      style={accent ? { "--sf-accent": accent } as React.CSSProperties : undefined}
      role="timer"
      aria-label={`${label ? label + ": " : ""}${numeric.toLocaleString("ru-RU")}`}
      aria-live="polite"
      aria-atomic="true"
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
