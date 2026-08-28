import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trackPlate, trackPlateShown } from "../lib/analytics";

/**
 * Монетизационная плашечка (гипотеза, по плану GLM-5.3):
 * реактивно появляется ПОСЛЕ завершённого действия (Поделиться/Скопировать/Отчёт),
 * один показ на сессию (localStorage), крестик — «не показывать 7 дней».
 * Кнопка «Поддержать» открывает ту же модалку ЮMoney (SupportModal).
 */

const LS_KEY = "dtp_donate_snooze_until";

export default function DonatePlate({ onSupport }: { onSupport: () => void }) {
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    const until = Number(localStorage.getItem(LS_KEY) ?? 0);
    if (Date.now() < until) return; // пользователь просил не показывать 7 дней
    // троттлинг: только после «зрелого» пребывания на странице (~8с), не с первой секунды
    const t = setTimeout(() => {
      if (!shownRef.current) {
        shownRef.current = true;
        setVisible(true);
        trackPlateShown(); // impression для CTR-метрики
      }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    setVisible(false);
    localStorage.setItem(LS_KEY, String(Date.now() + 7 * 86_400_000));
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-[#1a2233]/80 px-3.5 py-2.5"
        >
          <p className="min-w-0 text-xs leading-snug text-slate-300">
            <b className="text-slate-100">Проект бесплатный и без рекламы</b> — живёт на донаты.
            Поддержать — минута, а данные продолжают обновляться каждую неделю.
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => { trackPlate("plate"); onSupport(); setVisible(false); }}
              className="rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600"
            >
              Поддержать →
            </button>
            <button
              onClick={close}
              className="rounded-md px-1.5 py-1 text-xs text-slate-500 transition hover:text-slate-300"
              aria-label="Не показывать ещё 7 дней"
              title="Скрыть на 7 дней"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
