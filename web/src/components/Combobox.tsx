import { useEffect, useId, useRef, useState } from "react";

/**
 * Комбобокс с подсказками по мере ввода.
 *
 * Заменяет прежнюю схему «набери → нажми лупу → получи список».
 * Используется и для городов (асинхронный источник — Nominatim),
 * и для марок (синхронный — список из brands.json).
 *
 * Клавиатура: ↑ ↓ по списку, Enter — выбрать, Esc — закрыть.
 */
export interface ComboOption<T> {
  key: string;
  label: string;
  hint?: string;
  value: T;
}

export default function Combobox<T>({
  value,
  placeholder,
  options,
  loading = false,
  emptyHint,
  onQueryChange,
  onPick,
  onClear,
  className = "",
}: {
  /** текст в поле; управляется снаружи, чтобы можно было подставить выбранное */
  value: string;
  placeholder?: string;
  options: ComboOption<T>[];
  loading?: boolean;
  /** что показать, когда запрос введён, а вариантов нет */
  emptyHint?: string;
  onQueryChange: (q: string) => void;
  onPick: (opt: ComboOption<T>) => void;
  onClear?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Закрытие по клику вне компонента — иначе список висит поверх карты.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Курсор сбрасывается при смене набора вариантов, иначе подсветка
  // остаётся на строке, которой уже нет.
  useEffect(() => setCursor(-1), [options]);

  const pick = (opt: ComboOption<T>) => {
    onPick(opt);
    setOpen(false);
    setCursor(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (!options.length) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => (c + dir + options.length) % options.length);
      return;
    }
    if (e.key === "Enter") {
      // Enter без выделения не должен отправлять форму или строить маршрут
      // по пустому вводу — просто открываем список.
      if (cursor >= 0 && options[cursor]) {
        e.preventDefault();
        pick(options[cursor]);
      } else if (options.length === 1) {
        e.preventDefault();
        pick(options[0]);
      }
    }
  };

  const showList = open && (loading || options.length > 0 || (emptyHint != null && value.trim().length >= 3));

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-8 text-sm outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading ? (
          <span className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-600 border-t-orange-500" />
        ) : value ? (
          <button
            type="button"
            aria-label="Очистить"
            onClick={() => {
              onQueryChange("");
              onClear?.();
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-500 transition hover:text-slate-200"
          >
            ✕
          </button>
        ) : null}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[1200] mt-1 max-h-56 w-full space-y-0.5 overflow-auto rounded-lg border border-slate-700 bg-slate-800 p-1 text-xs shadow-xl"
        >
          {loading && options.length === 0 && (
            <li className="px-2 py-1.5 text-slate-400">Ищем…</li>
          )}
          {!loading && options.length === 0 && emptyHint && (
            <li className="px-2 py-1.5 text-slate-400">{emptyHint}</li>
          )}
          {options.map((opt, i) => (
            <li key={opt.key} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(opt)}
                className={`w-full rounded px-2 py-1.5 text-left transition ${
                  i === cursor ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700/60"
                }`}
              >
                <span className="block truncate">{opt.label}</span>
                {opt.hint && <span className="block truncate text-[10px] text-slate-500">{opt.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
