import type { PointRow } from "./types";

const R = 6_371_000; // радиус Земли, м

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Расстояние от точки до отрезка AB в метрах (локальная равнопромежуточная проекция). */
export function pointToSegmentMeters(
  plat: number, plon: number,
  alat: number, alon: number,
  blat: number, blon: number,
): number {
  const x = plon, y = plat;
  const x1 = alon, y1 = alat, x2 = blon, y2 = blat;
  // метры по осям в средней широте
  const latMid = ((y1 + y2 + y) / 3) * (Math.PI / 180);
  const kx = 111_320 * Math.cos(latMid);
  const ky = 110_540;
  const px = x * kx, py = y * ky;
  const ax = x1 * kx, ay = y1 * ky;
  const bx = x2 * kx, by = y2 * ky;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx, ey = ay + t * dy;
  const ddx = px - ex, ddy = py - ey;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

/** Отбирает точки ДТП в коридоре bufferM метров вокруг полилинии маршрута. */
export function filterCorridor(
  rows: PointRow[],
  line: [number, number][], // [lat, lon]
  bufferM = 300,
): PointRow[] {
  if (line.length < 2) return [];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [la, lo] of line) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
  }
  const padLat = bufferM / 111_000 + 0.005;
  const padLon = padLat / Math.cos((line[0][0] * Math.PI) / 180);

  const out: PointRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const la = r[0], lo = r[1];
    if (la < minLat - padLat || la > maxLat + padLat || lo < minLon - padLon || lo > maxLon + padLon)
      continue;
    for (let s = 1; s < line.length; s++) {
      const [ala, alo] = line[s - 1];
      const [bla, blo] = line[s];
      if (
        pointToSegmentMeters(la, lo, ala, alo, bla, blo) <= bufferM
      ) {
        out.push(r);
        break;
      }
    }
  }
  return out;
}
