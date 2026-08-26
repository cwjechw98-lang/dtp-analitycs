import type { PointRow } from "./types";

const R = 6_371_000; // радиус Земли, м
const KY = 110_540; // метров в градусе широты

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Расстояние от точки до отрезка AB в метрах (локальная проекция). */
export function pointToSegmentMeters(
  plat: number, plon: number,
  alat: number, alon: number,
  blat: number, blon: number,
): number {
  const latMid = ((alat + blat + plat) / 3) * (Math.PI / 180);
  const kx = 111_320 * Math.cos(latMid);
  const px = plon * kx, py = plat * KY;
  const ax = alon * kx, ay = alat * KY;
  const bx = blon * kx, by = blat * KY;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

interface Segment {
  ax: number; ay: number; bx: number; by: number;
  dx: number; dy: number; lenSq: number;
}

/**
 * Отбирает точки ДТП в коридоре bufferM метров вокруг полилинии маршрута.
 * Все сегменты проецируются в метры заранее (одна опорная широта на маршрут,
 * погрешность проекции на дистанциях до пары сотен км несущественна для
 * коридора в сотни метров), поэтому во внутреннем цикле нет тригонометрии.
 */
export function filterCorridor(
  rows: PointRow[],
  line: [number, number][], // [lat, lon]
  bufferM = 400,
): PointRow[] {
  if (line.length < 2) return [];

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  let latSum = 0;
  for (const [la, lo] of line) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
    latSum += la;
  }
  const KX = 111_320 * Math.cos((latSum / line.length) * (Math.PI / 180));
  const padLat = bufferM / KY + 0.005;
  const padLon = padLat / Math.cos((line[0][0] * Math.PI) / 180);
  const minLatP = minLat - padLat, maxLatP = maxLat + padLat;
  const minLonP = minLon - padLon, maxLonP = maxLon + padLon;

  const segs: Segment[] = [];
  for (let i = 1; i < line.length; i++) {
    const alat = line[i - 1][0], alon = line[i - 1][1];
    const blat = line[i][0], blon = line[i][1];
    const ax = alon * KX, ay = alat * KY;
    const bx = blon * KX, by = blat * KY;
    const dx = bx - ax, dy = by - ay;
    segs.push({ ax, ay, dx, dy, bx, by, lenSq: dx * dx + dy * dy });
  }

  const out: PointRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const la = r[0], lo = r[1];
    if (la < minLatP || la > maxLatP || lo < minLonP || lo > maxLonP) continue;
    const px = lo * KX, py = la * KY;
    for (let s = 0; s < segs.length; s++) {
      const sg = segs[s];
      let t = sg.lenSq === 0 ? 0 : ((px - sg.ax) * sg.dx + (py - sg.ay) * sg.dy) / sg.lenSq;
      if (t <= 0) {
        if ((px - sg.ax) ** 2 + (py - sg.ay) ** 2 <= bufferM * bufferM) { out.push(r); break; }
      } else if (t >= 1) {
        if ((px - sg.bx) ** 2 + (py - sg.by) ** 2 <= bufferM * bufferM) { out.push(r); break; }
      } else {
        const ex = sg.ax + t * sg.dx - px, ey = sg.ay + t * sg.dy - py;
        if (ex * ex + ey * ey <= bufferM * bufferM) { out.push(r); break; }
      }
    }
  }
  return out;
}

/** Точка внутри произвольного полигона (ray casting). pts: [lat, lon][] */
export function pointInPolygon(lat: number, lon: number, pts: [number, number][]): boolean {
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][0], xi = pts[i][1];
    const yj = pts[j][0], xj = pts[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Точка внутри круга (центр [lat, lon], радиус в метрах). */
export function pointInCircle(lat: number, lon: number, c: [number, number], radiusM: number): boolean {
  return haversine(lat, lon, c[0], c[1]) <= radiusM;
}
