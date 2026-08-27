import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { buildSearch } from "../lib/urlState";

/**
 * Синхронизация состояния раздела с адресной строкой (контракт §2).
 *
 * Два требования, которые легко нарушить:
 *
 *  1. Запись не должна зацикливаться. Компонент пишет в URL, роутер отдаёт
 *     новые searchParams, эффект видит изменение и пишет снова. Поэтому
 *     сравниваем со строкой, которую записали в прошлый раз, и молчим, если
 *     ничего не поменялось.
 *
 *  2. Запись идёт через replace, а не push. Иначе каждое движение ползунка
 *     буфера кладёт запись в историю, и «назад» приходится жать двадцать раз.
 */
export function useUrlWriter() {
  const [sp, setSp] = useSearchParams();
  const lastWritten = useRef<string | null>(null);

  return useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      // Пересобираем через buildSearch: порядок ключей всегда один и тот же,
      // иначе одно и то же состояние даёт разные строки и сравнение врёт.
      const sorted = buildSearch(Object.fromEntries(next.entries()));
      if (sorted === lastWritten.current) return;
      lastWritten.current = sorted;
      setSp(new URLSearchParams(sorted), { replace: true });
    },
    [sp, setSp],
  );
}

/**
 * Разовое применение параметров URL при первом заходе.
 *
 * Нужно именно один раз: дальше состоянием управляет пользователь, и
 * повторное применение затирало бы его действия при каждом ререндере.
 */
export function useUrlOnce(apply: (sp: URLSearchParams) => void) {
  const [sp] = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    apply(sp);
    // apply намеренно вне зависимостей: хук по смыслу срабатывает единожды
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
