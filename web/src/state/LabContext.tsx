import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

/**
 * «Лаборатория» (этап по фидбеку): пользователь сам собирает блоки
 * (карта, графики, находки, статистика) в свою раскладку и делится ею.
 * Раскладка сериализуется в `?lab=` (тип.span, порядок = порядок на экране),
 * не трогая параметры ResearchProvider (фильтры).
 */

export type LabBlockType = "map" | "severity" | "time" | "findings" | "stats" | "category";

export interface LabBlock {
  id: string;
  type: LabBlockType;
  span: 3 | 6 | 12;
}

export interface LabState {
  blocks: LabBlock[];
}

export type LabAction =
  | { type: "add"; block: LabBlock }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "span"; id: string; span: LabBlock["span"] }
  | { type: "set"; blocks: LabBlock[] }
  | { type: "reset" };

const DEFAULT_BLOCKS: LabBlock[] = [
  { id: "b-map", type: "map", span: 12 },
  { id: "b-sev", type: "severity", span: 6 },
  { id: "b-find", type: "findings", span: 6 },
  { id: "b-time", type: "time", span: 12 },
];

function reducer(s: LabState, a: LabAction): LabState {
  switch (a.type) {
    case "set": return { blocks: a.blocks };
    case "reset": return { blocks: DEFAULT_BLOCKS };
    case "add": return { blocks: [...s.blocks, a.block] };
    case "remove": return { blocks: s.blocks.filter((b) => b.id !== a.id) };
    case "move": {
      const i = s.blocks.findIndex((b) => b.id === a.id);
      const j = i + a.dir;
      if (i < 0 || j < 0 || j >= s.blocks.length) return s;
      const arr = [...s.blocks];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { blocks: arr };
    }
    case "span":
      return { blocks: s.blocks.map((b) => (b.id === a.id ? { ...b, span: a.span } : b)) };
    default: return s;
  }
}

/** Сериализация раскладки: "map.12,severity.6,..." */
export function serializeLab(blocks: LabBlock[]): string {
  return blocks.map((b) => `${b.type}.${b.span}`).join(",");
}

/** Парсинг раскладки из URL; при пустой/битой — дефолт. */
export function parseLab(raw: string | null): LabBlock[] {
  if (!raw) return DEFAULT_BLOCKS;
  const out: LabBlock[] = [];
  for (const tok of raw.split(",")) {
    const [type, span] = tok.split(".");
    const t = type as LabBlockType;
    if (!["map", "severity", "time", "findings", "stats", "category"].includes(t)) continue;
    const sp = Number(span);
    out.push({ id: `${t}-${out.length}`, type: t, span: sp === 3 || sp === 6 || sp === 12 ? sp : 12 });
  }
  return out.length ? out : DEFAULT_BLOCKS;
}

const Ctx = createContext<{ state: LabState; dispatch: (a: LabAction) => void } | null>(null);

export function LabProvider({ children }: { children: ReactNode }) {
  const initial = parseLab(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lab") : null);
  const [state, dispatch] = useReducer(reducer, { blocks: initial });

  // запись раскладки в URL (replace, без засорения истории)
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("lab", serializeLab(state.blocks));
    window.history.replaceState(null, "", u.toString());
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLab() {
  const v = useContext(Ctx);
  if (!v) throw new Error("lab context not ready");
  return v;
}
