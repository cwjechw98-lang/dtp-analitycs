import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { nf, useCountUp } from "../lib/format";
import SplitFlap from "./SplitFlap";

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Card({
  title,
  subtitle,
  aside,
  children,
  className = "",
  delay = 0,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      animate="show"
      whileHover={{ borderColor: "rgba(249,115,22,0.35)" }}
      className={`glass rounded-2xl border border-slate-800/80 p-4 sm:p-5 ${className}`}
    >
      {(title || aside) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      {children}
    </motion.section>
  );
}

const TONES: Record<string, { text: string; glow: string }> = {
  default: { text: "text-white", glow: "" },
  danger: { text: "text-red-400", glow: "drop-shadow-[0_0_18px_rgba(248,113,113,0.35)]" },
  warn: { text: "text-amber-300", glow: "drop-shadow-[0_0_18px_rgba(251,191,36,0.3)]" },
  good: { text: "text-emerald-400", glow: "drop-shadow-[0_0_18px_rgba(52,211,153,0.3)]" },
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  delay = 0,
  variant = "normal",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: keyof typeof TONES;
  delay?: number;
  /** "flap" — самолётное табло вместо простого числа */
  variant?: "normal" | "flap";
}) {
  const animated = typeof value === "number";
  const counted = useCountUp(animated ? (value as number) : 0);
  const t = TONES[tone];
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      animate="show"
      className="glass relative overflow-hidden rounded-2xl border border-slate-800/80 p-4"
    >
      <div className={`pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-gradient-to-b from-white/[0.07] to-transparent blur-xl`} />
      <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">{label}</div>
      {variant === "flap" && typeof value === "number" ? (
        <div className="mt-1.5 overflow-hidden">
          <SplitFlap value={value} accent={t.text.includes("text-red") ? "#ef4444" : t.text.includes("text-orange") ? "#f59e0b" : undefined} />
        </div>
      ) : (
        <div className={`mt-1 text-2xl font-extrabold tabular-nums tracking-tight ${t.text} ${t.glow}`}>
          {animated ? nf.format(counted as number) : value}
        </div>
      )}
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </motion.div>
  );
}

export function GradientText({ children }: { children: ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-orange-400 via-rose-400 to-violet-400 bg-clip-text text-transparent">
      {children}
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-800/80 text-slate-300",
    orange: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30",
    red: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
    green: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
    blue: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const inputCls =
  "rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 max-w-[240px]";

/**
 * Секция без коробки — открытая композиция.
 *
 * `Card` перестаёт быть универсальной единицей страницы. Раньше каждый
 * кусок содержимого был обёрнут в скруглённую панель с рамкой, и весь
 * экран говорил «я набор виджетов»: двадцать одинаковых прямоугольников,
 * ни один из которых не важнее другого.
 *
 * Правило разделения:
 *   Card    — самостоятельный объект: вердикт, карточка ДТП, то, чем делятся
 *   Section — всё остальное: график с выводом, таблица, список
 *
 * Секции отделяются расстоянием и тонкой линией, а не рамкой. Это и есть
 * «структура должна ощущаться, а не быть нарисована бордерами».
 */
export function Section({
  title,
  lead,
  aside,
  children,
  divider = true,
}: {
  title?: ReactNode;
  /** Строка-вывод: то, что человек должен унести, не разглядывая график. */
  lead?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <section
      className={divider ? "border-t pt-6" : ""}
      style={divider ? { borderColor: "var(--border)" } : undefined}
    >
      {(title || aside) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--muted)" }}
              >
                {title}
              </h2>
            )}
            {lead && <p className="lvl-finding mt-1.5">{lead}</p>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
