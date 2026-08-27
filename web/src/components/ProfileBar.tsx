import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import Combobox, { type ComboOption } from "./Combobox";
import { useNavigate } from "react-router-dom";
import { nf } from "../lib/format";
import { EXP_BUCKETS } from "../lib/urlState";
import { useApp } from "../state/AppState";
import { useProfile } from "../state/ProfileContext";

/**
 * Профиль водителя в шапке (контракт §3).
 *
 * Заменяет прежний RegionSelector: регион теперь не отдельный контрол,
 * а одно из трёх полей профиля. Всё остальное приложение подмешивает
 * эти значения вместо того, чтобы спрашивать их заново на каждой вкладке.
 */
export default function ProfileBar() {
  const app = useApp();
  const { profile, filled, set, clear } = useProfile();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Полный список марок, отсортированный по числу записей: частые сверху,
  // но найти можно и редкую. Прежний select показывал только топ.
  const brands = useMemo(
    () => app.national.culprits.brands.map((b) => b.brand),
    [app.national.culprits.brands],
  );

  const [brandQuery, setBrandQuery] = useState(profile.brand ?? "");

  // Фильтрация локальная и мгновенная — список уже в памяти, сеть не нужна.
  const brandOptions = useMemo((): ComboOption<string>[] => {
    const q = brandQuery.trim().toUpperCase();
    const pool = q ? brands.filter((b) => b.toUpperCase().includes(q)) : brands;
    // Совпадения с начала строки важнее вхождений в середине.
    const ranked = q
      ? [...pool].sort((a, b) => {
          const ai = a.toUpperCase().startsWith(q) ? 0 : 1;
          const bi = b.toUpperCase().startsWith(q) ? 0 : 1;
          return ai - bi;
        })
      : pool;
    return ranked.slice(0, 8).map((b) => ({ key: b, label: b, value: b }));
  }, [brands, brandQuery]);

  const summary = filled
    ? [
        profile.exp != null ? `${EXP_BUCKETS[profile.exp]} лет` : null,
        profile.brand,
        profile.region
          ? app.meta.regions.find((r) => r.slug === profile.region)?.name ?? profile.region
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Заполнить профиль";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Стаж, марка и домашний регион — хранятся только в твоём браузере"
        className={`max-w-[240px] truncate rounded-xl border px-3 py-2 text-xs font-medium transition ${
          filled
            ? "border-slate-700/80 bg-slate-900/70 text-slate-100 hover:border-slate-500"
            : "glow-ring border-transparent text-white"
        }`}
        style={filled ? undefined : { backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)" }}
      >
        <span className="mr-1.5">🎯</span>
        {summary}
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass absolute right-0 top-11 z-[1000] w-72 rounded-2xl border p-3 shadow-xl"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Профиль водителя
          </div>

          <label className="mb-2.5 block">
            <span className="mb-1 block text-[11px] text-slate-400">Стаж вождения</span>
            <select
              value={profile.exp ?? ""}
              onChange={(e) => set({ exp: e.target.value === "" ? null : Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-orange-500/60"
            >
              <option value="">не указан</option>
              {EXP_BUCKETS.map((b, i) => (
                <option key={b} value={i}>
                  {b} лет
                </option>
              ))}
            </select>
          </label>

          <div className="mb-2.5">
            <span className="mb-1 block text-[11px] text-slate-400">Марка автомобиля</span>
            <Combobox<string>
              value={brandQuery}
              placeholder="начни вводить — BMW, ВАЗ…"
              options={brandOptions}
              emptyHint="Такой марки нет в выборке"
              onQueryChange={setBrandQuery}
              onPick={(opt) => {
                setBrandQuery(opt.value);
                set({ brand: opt.value });
              }}
              onClear={() => set({ brand: null })}
            />
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] text-slate-400">Домашний регион</span>
            <select
              value={profile.region ?? "ALL"}
              onChange={(e) => {
                const v = e.target.value === "ALL" ? null : e.target.value;
                set({ region: v });
                // Регион профиля сразу становится областью просмотра —
                // иначе пришлось бы выбирать его дважды.
                app.setScope(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-orange-500/60"
            >
              <option value="ALL">🇷🇺 Вся Россия · {nf.format(app.meta.total_accidents)} ДТП</option>
              {app.meta.regions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name} · {nf.format(r.total)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {
                setOpen(false);
                navigate("/me");
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Мой риск →
            </button>
            {filled && (
              <button
                onClick={clear}
                className="text-[11px] text-slate-500 underline decoration-dotted hover:text-slate-300"
              >
                очистить
              </button>
            )}
          </div>

          <p className="mt-2.5 text-[10px] leading-snug text-slate-600">
            Хранится только в этом браузере. На сервер не уходит ничего.
          </p>
        </motion.div>
      )}
    </div>
  );
}
