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
 * Провайдеры растровых тайлов. CARTO работает на глобальном CDN и заметно
 * быстрее публичного tile.openstreetmap.org; тёмная тема совпадает с дизайном.
 */
export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: "carto-dark",
    name: "Тёмная",
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
  {
    id: "osm",
    name: "OSM",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: "esri-sat",
    name: "Спутник",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
];

const LS_KEY = "dtp_tile_provider";

export function savedProviderId(): string {
  try {
    const v = localStorage.getItem(LS_KEY);
    return TILE_PROVIDERS.some((p) => p.id === v) ? (v as string) : "carto-dark";
  } catch {
    return "carto-dark";
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
  onError?: () => void,
): L.TileLayer {
  const p = TILE_PROVIDERS.find((x) => x.id === providerId) ?? TILE_PROVIDERS[0];
  const layer = L.tileLayer(p.url, {
    attribution: p.attribution,
    maxZoom: p.maxZoom,
    subdomains: p.subdomains ?? "abc",
    detectRetina: false,
    crossOrigin: true,
  });
  if (onError) layer.on("tileerror", onError);
  return layer;
}
