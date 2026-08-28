import { createContext, useContext, useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { PointRow } from "../lib/types";
import { rowPasses, filterFromUrl, urlCodeForValue, type ResearchFilter } from "../lib/research";
import { useAppState } from "./AppState";

/**
 * Shared Research filter engine (Этап B).
 * Единый typed filter state + URL state (readable versioned contract).
 * Все поверхности (Atlas, Route, Fleet, графики, findings, share) читают один
 * и тот же state — один источник истины, никаких несовместимых механик.
 */

// ---- typed filter state ----
export interface ResearchState {
  /** выбрано 'ALL' или slug региона */
  scope: string;
  /** индексы местных районов внутри текущего region file (быстрый фильтр) */
  localRegions: number[];
  yearMin: number | null;
  yearMax: number | null;
  severities: number[];
  crashCategories: number[];
  weathers: number[];
  lights: number[];
  roads: number[];
  vehSupers: number[];
  brands: number[];
  partTypes: number[];
  outcomes: number[];
  infra: number[];
}

export type ResearchAction =
  | { type: "scope"; value: string }
  | { type: "localRegions"; value: number[] }
  | { type: "years"; min: number | null; max: number | null }
  | { type: "severities"; value: number[] }
  | { type: "crashCategories"; value: number[] }
  | { type: "weathers"; value: number[] }
  | { type: "lights"; value: number[] }
  | { type: "roads"; value: number[] }
  | { type: "vehSupers"; value: number[] }
  | { type: "brands"; value: number[] }
  | { type: "partTypes"; value: number[] }
  | { type: "outcomes"; value: number[] }
  | { type: "infra"; value: number[] }
  | { type: "reset" };

const EMPTY: Omit<ResearchState, "scope"> = {
  localRegions: [], yearMin: null, yearMax: null,
  severities: [], crashCategories: [], weathers: [], lights: [], roads: [],
  vehSupers: [], brands: [], partTypes: [], outcomes: [], infra: [],
};

function reducer(s: ResearchState, a: ResearchAction): ResearchState {
  switch (a.type) {
    case "scope": return { ...s, scope: a.value };
    case "localRegions": return { ...s, localRegions: a.value };
    case "years": return { ...s, yearMin: a.min, yearMax: a.max };
    case "severities": return { ...s, severities: a.value };
    case "crashCategories": return { ...s, crashCategories: a.value };
    case "weathers": return { ...s, weathers: a.value };
    case "lights": return { ...s, lights: a.value };
    case "roads": return { ...s, roads: a.value };
    case "vehSupers": return { ...s, vehSupers: a.value };
    case "brands": return { ...s, brands: a.value };
    case "partTypes": return { ...s, partTypes: a.value };
    case "outcomes": return { ...s, outcomes: a.value };
    case "infra": return { ...s, infra: a.value };
    case "reset": return { ...EMPTY, scope: s.scope };
    default: return s;
  }
}

export function toFilter(s: ResearchState): ResearchFilter {
  return {
    vehSupers: s.vehSupers.length ? s.vehSupers : undefined,
    partTypes: s.partTypes.length ? s.partTypes : undefined,
    outcomes: s.outcomes.length ? s.outcomes : undefined,
    infra: s.infra.length ? s.infra : undefined,
    severities: s.severities.length ? s.severities : undefined,
    crashCats: s.crashCategories.length ? s.crashCategories : undefined,
    weathers: s.weathers.length ? s.weathers : undefined,
    lights: s.lights.length ? s.lights : undefined,
    roads: s.roads.length ? s.roads : undefined,
    yearMin: s.yearMin ?? undefined,
    yearMax: s.yearMax ?? undefined,
  };
}

const Ctx = createContext<{
  state: ResearchState;
  dispatch: (a: ResearchAction) => void;
  filter: ResearchFilter;
  filteredRows: (rows: PointRow[]) => PointRow[];
} | null>(null);

export function ResearchProvider({ children }: { children: ReactNode }) {
  const app = useAppState();
  const [state, dispatch] = useReducer(reducer, { ...EMPTY, scope: "ALL" });

  // синхронизация со старым scope из AppState (app может быть null до готовности)
  useEffect(() => {
    if (app) dispatch({ type: "scope", value: app.scope });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.scope]);

  const filter = useMemo(() => toFilter(state), [state]);

  // --- URL state (B4): инициализация из URL + запись при изменении (debounce) ---
  const urlInit = useRef(false);
  useEffect(() => {
    if (!app) return;
    const from = filterFromUrl(new URL(window.location.href), app.dicts);
    if (from.vehSupers) dispatch({ type: "vehSupers", value: from.vehSupers });
    if (from.partTypes) dispatch({ type: "partTypes", value: from.partTypes });
    if (from.outcomes) dispatch({ type: "outcomes", value: from.outcomes });
    if (from.infra) dispatch({ type: "infra", value: from.infra });
    if (from.severities) dispatch({ type: "severities", value: from.severities });
    if (from.yearMin !== undefined) dispatch({ type: "years", min: from.yearMin ?? null, max: from.yearMax ?? null });
    const r = new URL(window.location.href).searchParams.get("r");
    if (r) app.setScope(r);
    urlInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  const writeUrl = useCallback(
    (s: ResearchState) => {
      if (!app) return;
      const dicts = app.dicts;
      const u = new URL(window.location.href);
      u.searchParams.set("v", "1");
      if (s.yearMin !== null && s.yearMax !== null) {
        u.searchParams.set("y", s.yearMin === s.yearMax ? String(s.yearMin) : `${s.yearMin}-${s.yearMax}`);
      } else {
        u.searchParams.delete("y");
      }
      if (s.severities.length) {
        const map: Record<number, string> = { 2: "fatal", 1: "heavy", 0: "light" };
        u.searchParams.set("sev", s.severities.map((x) => map[x]).join(","));
      } else u.searchParams.delete("sev");
      const codeOf = (dictName: "veh_supers" | "part_types" | "outcome_groups" | "infra_facets", dict: string[], ids: number[]): string[] | null => {
        if (!ids.length) return null;
        const out: string[] = [];
        for (const i of ids) out.push(urlCodeForValue(dictName, dict[i] ?? ""));
        return out;
      };
      const vs = codeOf("veh_supers", dicts.veh_supers, s.vehSupers);
      if (vs) u.searchParams.set("veh", vs.join(",")); else u.searchParams.delete("veh");
      const ps = codeOf("part_types", dicts.part_types, s.partTypes);
      if (ps) u.searchParams.set("part", ps.join(",")); else u.searchParams.delete("part");
      const os = codeOf("outcome_groups", dicts.outcome_groups, s.outcomes);
      if (os) u.searchParams.set("out", os.join(",")); else u.searchParams.delete("out");
      const ins = codeOf("infra_facets", dicts.infra_facets, s.infra);
      if (ins) u.searchParams.set("inf", ins.join(",")); else u.searchParams.delete("inf");
      if (s.scope && s.scope !== "ALL") u.searchParams.set("r", s.scope); else u.searchParams.delete("r");
      window.history.replaceState(null, "", u.toString());
    },
    [app?.dicts]
  );

  // запись в URL с debounce (не засорять history)
  useEffect(() => {
    if (!urlInit.current) return;
    const t = setTimeout(() => writeUrl(state), 250);
    return () => clearTimeout(t);
  }, [state, writeUrl]);

  const filteredRows = useCallback(
    (rows: PointRow[]) => rows.filter((r) => rowPasses(r, filter)),
    [filter]
  );

  const value = useMemo(
    () => ({ state, dispatch, filter, filteredRows }),
    [state, filter, filteredRows]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResearch() {
  const v = useContext(Ctx);
  if (!v) throw new Error("research context not ready");
  return v;
}
