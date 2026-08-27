import { useState } from "react";
import { trackShare } from "../lib/analytics";

/**
 * Кнопка «поделиться» (контракт §4).
 *
 * Собирает абсолютную ссылку и кладёт в буфер. На мобильных сначала пробуем
 * системный шэр — там это привычнее и сразу предлагает Telegram.
 *
 * Важная деталь из контракта: воркер, который рисует OG-картинку, не умеет
 * считать то, что посчитал браузер. Поэтому результат дописывается прямо в
 * ссылку (например n=1040) — иначе в превью нечего показать.
 */
export default function ShareButton({
  path,
  params,
  title,
  label = "Поделиться",
  className = "",
}: {
  /** путь без базы, например "/route" */
  path: string;
  params: Record<string, string | number | null | undefined>;
  /** заголовок для системного шэра */
  title: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  const build = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const sp = new URLSearchParams();
    for (const k of Object.keys(params).sort()) {
      const v = params[k];
      if (v != null && v !== "") sp.set(k, String(v));
    }
    const q = sp.toString();
    return `${location.origin}${base}${path}${q ? `?${q}` : ""}`;
  };

  const onClick = async () => {
    const url = build();
    trackShare(path.includes("fleet") ? "fleet" : path.includes("me") ? "me" : "route");
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      // Отмена системного шэра — не ошибка, пользователь просто передумал.
      if ((e as Error)?.name === "AbortError") return;
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 ${className}`}
    >
      {state === "done" ? "✓ Ссылка скопирована" : state === "error" ? "Не удалось скопировать" : `🔗 ${label}`}
    </button>
  );
}
