export interface OsrmRoute {
  geometry: [number, number][]; // [lat, lon]
  distanceKm: number;
  durationMin: number;
}

/** Маршрут через публичный демо-сервер OSRM (профиль car). */
export async function fetchRoute(a: [number, number], b: [number, number]): Promise<OsrmRoute> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM: HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== "Ok" || !json.routes?.length)
    throw new Error("OSRM: маршрут не найден между этими точками");
  const route = json.routes[0];
  return {
    geometry: route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  };
}

export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
}

/** Геокодинг через Nominatim (лёгкое использование с задержкой). */
export async function geocode(query: string): Promise<GeoResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ru` +
    `&q=${encodeURIComponent(query + " Омская область")}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`);
  const json = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return json.map((r) => ({
    name: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}
