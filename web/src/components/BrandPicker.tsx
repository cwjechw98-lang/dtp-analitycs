import { useEffect, useMemo, useRef, useState } from "react";
import Combobox, { type ComboOption } from "./Combobox";
import { nf } from "../lib/format";
import { isRealBrand } from "../lib/findings";
import type { BrandsFile } from "../lib/types";
import { useProfile } from "../state/ProfileContext";

/**
 * Выбор марок для сравнения.
 *
 * Чинит четыре жалобы разом:
 *
 *  1. Пустое поле ввода не подсказывало, что вообще можно ввести —
 *     теперь под ним сетка популярных марок, куда можно просто ткнуть.
 *  2. Строка поиска не очищалась после добавления, и карточка висела,
 *     пока её не сотрёшь руками.
 *  3. Повторный тап по выбранной марке снимал выбор, хотя на всех
 *     привычных сайтах он ведёт К сравнению. Теперь снятие — только
 *     крестиком на чипе, а повторный тап уводит к результату.
 *  4. Ограничение «до трёх» подавалось как запрет. Теперь четвёртая
 *     марка вытесняет самую старую, и об этом сказано заранее.
 */
export default function BrandPicker({
  brandsFile,
  selected,
  onChange,
  onGoToCompare,
  openSignal = 0,
}: {
  brandsFile: BrandsFile;
  selected: string[];
  onChange: (next: string[]) => void;
  onGoToCompare: () => void;
  /** Счётчик-триггер: рост значения раскрывает выбор и фокусирует поиск. */
  openSignal?: number;
}) {
  const { profile } = useProfile();
  const [query, setQuery] = useState("");
  /**
   * Как только сравнение собрано, выбор сворачивается в строку чипов.
   *
   * Причина арифметическая: карточка вердикта занимает ~620px, шапка ~104px.
   * С развёрнутым выбором сумма переваливает за 900px, и на экране 390×844
   * вердикт уезжает за край — то есть главное требование плана нарушается
   * ровно в тот момент, когда человек получил результат.
   */
  const [expanded, setExpanded] = useState(false);
  /*
   * Сворачиваемся только когда сравнение уже собрано (две марки).
   *
   * Раньше сворачивались и на одной — и этим прятали всю функцию
   * сравнения за крошечную ссылку «изменить выбор»: поисковая строка
   * исчезала, и понять, что можно добавить вторую марку, было неоткуда.
   *
   * Расчёт, которым я это оправдывал, был для карточки ПАРЫ (620px).
   * Досье одной марки короче: 380–550px, и с развёрнутым выбором даёт
   * 594 из 844 — место было с запасом.
   */
  const collapsed = selected.length >= 2 && !expanded;

  const boxRef = useRef<HTMLDivElement>(null);
  const firstSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal === firstSignal.current) return;
    setExpanded(true);
    // Скролл после раскрытия: без него поле появляется за пределами экрана,
    // и нажатие кнопки выглядит как «ничего не произошло».
    requestAnimationFrame(() => {
      boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      boxRef.current?.querySelector("input")?.focus();
    });
  }, [openSignal]);

  const names = useMemo(
    () =>
      Object.keys(brandsFile.brands)
        .filter(isRealBrand)
        .sort((x, y) => brandsFile.brands[y].total - brandsFile.brands[x].total),
    [brandsFile],
  );

  /** Сетка быстрого выбора: топ плюс марка из профиля, если она вне топа. */
  const quick = useMemo(() => {
    const top = names.slice(0, 11);
    const mine = profile.brand;
    if (mine && !top.some((n) => n.toUpperCase() === mine.toUpperCase())) {
      const exact = names.find((n) => n.toUpperCase() === mine.toUpperCase());
      if (exact) return [exact, ...top.slice(0, 10)];
    }
    return top;
  }, [names, profile.brand]);

  const options = useMemo((): ComboOption<string>[] => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const pool = names.filter((n) => n.toUpperCase().includes(q));
    return pool
      .sort((x, y) => Number(!x.toUpperCase().startsWith(q)) - Number(!y.toUpperCase().startsWith(q)))
      .slice(0, 8)
      .map((n) => ({
        key: n,
        label: n,
        hint: `${nf.format(brandsFile.brands[n].total)} ДТП`,
        value: n,
      }));
  }, [names, query, brandsFile]);

  const add = (name: string) => {
    if (selected.includes(name)) {
      // Повторный выбор — это намерение посмотреть результат,
      // а не отменить свой же выбор.
      onGoToCompare();
      return;
    }
    // Четвёртая вытесняет первую, а не отклоняется молча.
    const next = selected.length >= 3 ? [...selected.slice(1), name] : [...selected, name];
    onChange(next);
    setQuery(""); // жалоба №2: строка больше не висит
    if (next.length >= 2) {
      setExpanded(false);
      // Вердикт появляется ВЫШЕ выбора, то есть вне поля зрения.
      // Без этого человек добавляет вторую марку и не видит, что
      // что-то вообще произошло.
      requestAnimationFrame(() => onGoToCompare());
    }
  };

  const remove = (name: string) => onChange(selected.filter((x) => x !== name));

  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((name) => (
          <span
            key={name}
            className="flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent) 16%, transparent)",
              color: "var(--accent)",
            }}
          >
            {name}
            <button
              onClick={() => remove(name)}
              aria-label={`Убрать ${name}`}
              className="flex h-5 w-5 items-center justify-center rounded-full opacity-60 transition hover:bg-slate-900/40 hover:opacity-100"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          onClick={() => setExpanded(true)}
          className="lvl-meta underline decoration-dotted hover:text-slate-300"
        >
          изменить
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="space-y-3">
      <Combobox<string>
        value={query}
        placeholder="Найти марку: BMW, Toyota, ВАЗ…"
        options={options}
        emptyHint="Такой марки нет в выборке"
        onQueryChange={setQuery}
        onPick={(opt) => add(opt.value)}
      />

      {selected.length === 0 && (
        <div>
          <p className="lvl-meta mb-2">Или выбери две марки — сравним их между собой</p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((n) => (
              <button key={n} onClick={() => add(n)} className="lvl-action-quiet !min-h-0 !py-1.5 !text-xs">
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent) 16%, transparent)",
                color: "var(--accent)",
              }}
            >
              {name}
              <button
                onClick={() => remove(name)}
                aria-label={`Убрать ${name}`}
                className="flex h-5 w-5 items-center justify-center rounded-full opacity-60 transition hover:bg-slate-900/40 hover:opacity-100"
              >
                ✕
              </button>
            </span>
          ))}


          {selected.length === 3 && (
            <span className="lvl-meta">следующая марка заменит первую</span>
          )}
          <button
            onClick={() => onChange([])}
            className="lvl-meta underline decoration-dotted hover:text-slate-300"
          >
            очистить
          </button>
        </div>
      )}
    </div>
  );
}
