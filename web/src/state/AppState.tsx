import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { BrandsFile, Dictionaries, HeatCell, Meta, National, PointRow, RegionFile, Tips } from "../lib/types";

const BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const regionCache = new Map<string, Promise<RegionFile>>();
let heatCache: Promise<HeatCell[]> | null = null;
let brandsCache: Promise<BrandsFile> | null = null;

export interface AppState {
  ready: boolean;
  error: string | null;
  meta: Meta;
  dicts: Dictionaries;
  national: National;
  experience: National["experience"];
  tips: Tips;
  /** 'ALL' — вся Россия, иначе slug региона */
  scope: string;
  setScope: (s: string) => void;
  /** Файл текущего региона (null в режиме ALL или пока грузится) */
  regionFile: RegionFile | null;
  regionLoading: boolean;
  loadRegion: (slug: string) => Promise<RegionFile>;
  loadHeatCells: () => Promise<HeatCell[]>;
  loadBrands: () => Promise<BrandsFile>;
}

const Ctx = createContext<AppState | null>(null);

export function useAppState(): AppState | null {
  return useContext(Ctx);
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [core, setCore] = useState<
    { meta: Meta; dicts: Dictionaries; national: National; tips: Tips } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState("ALL");
  const [regionFile, setRegionFile] = useState<RegionFile | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [meta, dicts, national, tips] = await Promise.all([
          getJson<Meta>("meta.json"),
          getJson<Dictionaries>("dictionaries.json"),
          getJson<National>("national.json"),
          getJson<Tips>("tips.json"),
        ]);
        if (alive) setCore({ meta, dicts, national, tips });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadRegion = async (slug: string): Promise<RegionFile> => {
    let p = regionCache.get(slug);
    if (!p) {
      p = getJson<RegionFile>(`regions/${slug}.json`);
      regionCache.set(slug, p);
    }
    return p;
  };

  // авто-загрузка строк выбранного региона
  useEffect(() => {
    if (scope === "ALL") {
      setRegionFile(null);
      return;
    }
    let alive = true;
    setRegionLoading(true);
    loadRegion(scope)
      .then((f) => alive && setRegionFile(f))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setRegionLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const loadHeatCells = (): Promise<HeatCell[]> => {
    heatCache ??= getJson<HeatCell[]>("heat_cells.json");
    return heatCache;
  };

  const loadBrands = (): Promise<BrandsFile> => {
    brandsCache ??= getJson<BrandsFile>("brands.json");
    return brandsCache;
  };

  const value: AppState | null =
    core == null
      ? null
      : {
          ready: true,
          error,
          ...core,
          experience: core.national.experience,
          scope,
          setScope,
          regionFile,
          regionLoading,
          loadRegion,
          loadHeatCells,
          loadBrands,
        };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Хук для компонентов: гарантированно не-null состояние после загрузки. */
export function useApp(): AppState & { ready: true } {
  const v = useAppState();
  if (!v || !v.ready) throw new Error("app not ready");
  return v as AppState & { ready: true };
}

export type { PointRow };

