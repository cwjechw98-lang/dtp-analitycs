import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Модальное окно поддержки. Внутри — iframe кнопки ЮMoney
 * (быстрый донат без ухода с сайта). Открывается из CoffeeBlock.
 */
const YOOMONEY_IFRAME =
  "https://yoomoney.ru/quickpay/fundraise/button?billNumber=1JUA6MO9J9L.260828&";

export default function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open) setLoaded(false);
    // esc → закрыть
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1200] flex items-center justify-center p-4"
          onClick={onClose}
          style={{ background: "rgba(7, 11, 20, 0.72)", backdropFilter: "blur(6px)" }}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-sm rounded-2xl border border-slate-700/70 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold text-white">Поддержать проект</h3>
              <button
                onClick={onClose}
                className="rounded-md px-2 py-1 text-slate-500 transition hover:text-slate-200"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              ДТП Аналитика — независимый открытый проект. Данные ГИБДД пересобираются каждую неделю:
              это время и деньги за хостинг и домен. Спасибо за поддержку.
            </p>

            {/* Кнопка ЮMoney — быстрый платёж */}
            <div className="mt-4 flex justify-center">
              <div className="overflow-hidden rounded-xl">
                {!loaded && <div className="py-3 text-xs text-slate-500">Загружаем кнопку Яндекс Кошелька…</div>}
                <iframe
                  src={YOOMONEY_IFRAME}
                  width="330"
                  height="50"
                  frameBorder="0"
                  scrolling="no"
                  allowTransparency
                  onLoad={() => setLoaded(true)}
                  title="Поддержать ДТП Аналитика (ЮMoney)"
                />
              </div>
            </div>

            <p className="mt-3 text-center text-[10px] text-slate-600">
              Без подписок и автоматических списаний · один раз, сколько удобно
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
