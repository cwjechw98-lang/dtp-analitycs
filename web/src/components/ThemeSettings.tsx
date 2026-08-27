import { motion } from "framer-motion";
import { useState } from "react";
import { ACCENTS, useTheme, type AccentId } from "../state/ThemeContext";

/** Перенесено из App.tsx без изменений — только вынесено в свой файл. */
export default function ThemeSettings() {
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
