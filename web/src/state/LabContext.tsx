import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

/**
 * «Лаборатория» (редизайн по фидбеку): пользователь сам собирает исследование
 * из заранее спроектированных блоков (не Tableau-конструктор). Все блоки
 * питаются единым ResearchProvider (один срез — вся лаборатория перестраивается).
 * Раскладка сериализуется в `?lab=` (тип.размер, порядок), фильтры — в параметрах
 * ResearchProvider (y/sev/veh/r...). URL хранит и фильтры, и композицию.
 */

export type LabBlockType =
  | "map" | "years" | "severity" | "brands" | "tod" | "weather"
  | "category" | "participants" | "infra" | "findings";

export type LabSize = "S" | "M" | "L";

export interface LabBlock {
  id: string;
  type: LabBlockType;
  size: LabSize;
}

export interface LabState {
  blocks: LabBlock[];
}

export type LabAction =
  | { type: "add"; block: LabBlock }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "reorder"; from: number; to: number }
  | { type: "size"; id: string; size: LabSize }
  | { type: "set"; blocks: LabBlock[] }
  | { type: "reset" };

/** Пустой старт — «Что добавить в исследование?» (по видению пользователя). */
const EMPTY_BLOCKS: LabBlock[] = [];

function reducer(s: LabState, a: LabAction): LabState {
  switch (a.type) {
    case "set": return { blocks: a.blocks };
    case "reset": return { blocks: EMPTY_BLOCKS };
    case "add": return { blocks: [...s.blocks, a.block] };
    case "remove": return { blocks: s.blocks.filter((b) => b.id !== a.id) };
    case "duplicate": {
      const i = s.blocks.findIndex((b) => b.id === a.id);
      if (i < 0) return s;
      const src = s.blocks[i];
      const copy = { ...src, id: `${src.type}-dup-${Date.now()}` };
      const arr = [...s.blocks];
      arr.splice(i + 1, 0, copy);
      return { blocks: arr };
    }
    case "move": {
      const i = s.blocks.findIndex((b) => b.id === a.id);
      const j = i + a.dir;
      if (i < 0 || j < 0 || j >= s.blocks.length) return s;
      const arr = [...s.blocks];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { blocks: arr };
    }
    case "reorder": {
      if (a.from < 0 || a.from >= s.blocks.length || a.to < 0 || a.to >= s.blocks.length) return s;
      const arr = [...s.blocks];
      const [moved] = arr.splice(a.from, 1);
      arr.splice(a.to, 0, moved);
      return { blocks: arr };
    }
    case "size":
      return { blocks: s.blocks.map((b) => (b.id === a.id ? { ...b, size: a.size } : b)) };
    default: return s;
  }
}

/** Сериализация раскладки: "map.L,years.M,severity.M,..." */
export function serializeLab(blocks: LabBlock[]): string {
  return blocks.map((b) => `${b.type}.${b.size}`).join(",");
}

/** Парсинг раскладки из URL; при пустой/битой — пустой старт. */
export function parseLab(raw: string | null): LabBlock[] {
  if (!raw) return EMPTY_BLOCKS;
  const VALID: LabBlockType[] = ["map", "years", "severity", "brands", "tod", "weather", "category", "participants", "infra", "findings"];
  const out: LabBlock[] = [];
  for (const tok of raw.split(",")) {
    const [type, size] = tok.split(".");
    const t = type as LabBlockType;
    if (!VALID.includes(t)) continue;
    const sz = size as LabSize;
    out.push({ id: `${t}-${out.length}`, type: t, size: sz === "S" || sz === "M" || sz === "L" ? sz : "M" });
  }
  return out;
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
