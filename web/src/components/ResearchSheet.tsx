import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ResearchFilters from "./ResearchFilters";

/**
 * Выезжающая панель фильтров исследования.
 * Desktop: боковая панель ~360px справа поверх контента (карта НЕ ужимается).
 * Mobile: bottom sheet на ~80% высоты.
 * Закрыл — осталось исследование (строка состояния с чипами), не огромная форма.
 */
export default function ResearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* подложка */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1100]"
            style={{ background: "rgba(7, 11, 20, 0.5)", backdropFilter: "blur(2px)" }}
            onClick={onClose}
          />

          {/* панель: desktop — справа, mobile — снизу */}
          <motion.div
            initial={{ x: 380, y: 0 }}
            animate={{ x: 0, y: 0 }}
            exit={{ x: 380, y: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 z-[1150] h-full w-[min(92vw,380px)] overflow-y-auto border-l border-slate-700/70 bg-[#0b101d]/95 p-4 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Фильтры исследования</h3>
              <button
                onClick={onClose}
                className="rounded-md px-2 py-1 text-slate-500 transition hover:text-slate-200"
                aria-label="Закрыть фильтры"
              >
                ✕
              </button>
            </div>
            <ResearchFilters />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
