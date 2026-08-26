import L from "leaflet";

export interface TileProvider {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}

/**
 * Провайдеры растровых тайлов, все без API-ключей.
 * По умолчанию — официальный OSM: стабильный и проверенный.
 * CARTO быстрый, но у части провайдеров не грузится, поэтому только опция.
 */
export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: "osm",
    name: "OSM",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: "esri-gray",
    name: "Тёмная",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Source: Esri, Garmin, HERE, FAO, NOAA",
    maxZoom: 16,
  },
  {
    id: "esri-sat",
    name: "Спутник",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  {
    id: "carto-dark",
    name: "CARTO",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  {
    id: "carto-voyager",
    name: "Voyage",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
];

export const DEFAULT_PROVIDER = "osm";

const LS_KEY = "dtp_tile_provider";

export function savedProviderId(): string {
  try {
    const v = localStorage.getItem(LS_KEY);
    // миграция: CARTO раньше был дефолтом и у части пользователей не грузился
    if (v && v.startsWith("carto")) return DEFAULT_PROVIDER;
    return TILE_PROVIDERS.some((p) => p.id === v) ? (v as string) : DEFAULT_PROVIDER;
  } catch {
    return DEFAULT_PROVIDER;
  }
}

export function saveProviderId(id: string): void {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {
    /* приватный режим — не критично */
  }
}

/** Создаёт слой тайлов выбранного провайдера. */
export function createTileLayer(
  providerId: string,
  handlers?: { error?: () => void; load?: () => void },
): L.TileLayer {
  const p = TILE_PROVIDERS.find((x) => x.id === providerId) ?? TILE_PROVIDERS[0];
  const layer = L.tileLayer(p.url, {
    attribution: p.attribution,
    maxZoom: p.maxZoom,
    subdomains: p.subdomains ?? "abc",
    detectRetina: false,
    crossOrigin: true,
  });
  if (handlers?.error) layer.on("tileerror", handlers.error);
  if (handlers?.load) layer.on("tileload", handlers.load);
  return layer;
}

/**
 * Сторожевой таймер провайдера: если пошла серия ошибок тайлов и ни один
 * не загрузился — вызываем onGiveUp() один раз (автооткат на OSM).
 */
export function tileWatchdog(onGiveUp: () => void): {
  onLoad: () => void;
  onError: () => void;
} {
  let loads = 0;
  let errors = 0;
  let fired = false;
  return {
    onLoad() {
      loads++;
    },
    onError() {
      errors++;
      if (!fired && errors >= 8 && loads === 0) {
        fired = true;
        onGiveUp();
      }
    },
  };
}
