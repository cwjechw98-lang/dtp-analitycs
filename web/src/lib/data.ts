/** Устаревший загрузчик заменён на state/AppState.tsx — здесь остались общие константы. */

export function humanDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export const SEV_COLORS = ["#38bdf8", "#f59e0b", "#ef4444"];
export const ACCENT = "#f97316";
