import { describe, expect, it } from "vitest";
import { filterCorridor, haversine, pointInCircle, pointInPolygon, pointToSegmentMeters } from "../corridor";
import type { PointRow } from "../types";

function row(lat: number, lon: number): PointRow {
  // остальные колонки для тестов коридора не важны
  return [lat, lon, 202406, 2, 12, 0, 0, 0, 0, 0, -1, -1, 0, 0, -2, 1];
}

describe("haversine", () => {
  it("считает известное расстояние Омск→Исилькуль ~120-130 км", () => {
    const d = haversine(54.9885, 73.3242, 54.9136, 71.2685);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(135_000);
  });

  it("нулевое расстояние для одной точки", () => {
    expect(haversine(55, 82, 55, 82)).toBe(0);
  });
});

describe("pointToSegmentMeters", () => {
  it("проекция на середину отрезка", () => {
    // отрезок по параллели 55° длиной ~0.02° (~1280 м), точка в 0.001° южнее (~111 м)
    const d = pointToSegmentMeters(54.999, 10.01, 55.0, 10.0, 55.0, 10.02);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(140);
  });

  it("учитывает концы отрезка", () => {
    const d = pointToSegmentMeters(55.05, 10.5, 55.0, 10.0, 55.0, 10.02);
    expect(d).toBeGreaterThan(4000);
  });
});

describe("filterCorridor", () => {
  const line: [number, number][] = [
    [55.0, 9.98],
    [55.0, 10.02],
    [55.02, 10.04],
  ];

  it("берёт точки внутри буфера и отбрасывает дальние", () => {
    const rows = [
      row(55.0005, 10.0),   // ~55 м к северу — внутри
      row(55.0025, 10.01),  // ~280 м — на грани, внутри
      row(55.004, 10.0),    // ~450 м — снаружи
      row(56.5, 11.5),      // далеко — снаружи
      row(55.015, 10.03),   // рядом со вторым сегментом — внутри
    ];
    const kept = filterCorridor(rows, line, 300);
    expect(kept).toHaveLength(3);
    expect(kept[0]).toBe(rows[0]);
    expect(kept[1]).toBe(rows[1]);
    expect(kept[2]).toBe(rows[4]);
  });

  it("пустая линия даёт пустой результат", () => {
    expect(filterCorridor([row(55, 10)], [], 300)).toHaveLength(0);
  });

  it("сохраняет порядок исходных строк", () => {
    const rows = [row(56, 12), row(55.0005, 10.0), row(57, 13)];
    const kept = filterCorridor(rows, line, 300);
    expect(kept.map((r) => r[0])).toEqual([55.0005]);
  });
});

describe("pointInPolygon", () => {
  // квадрат 55.0–55.1 × 10.0–10.1
  const sq: [number, number][] = [
    [55.0, 10.0],
    [55.0, 10.1],
    [55.1, 10.1],
    [55.1, 10.0],
  ];

  it("внутри и снаружи квадрата", () => {
    expect(pointInPolygon(55.05, 10.05, sq)).toBe(true);
    expect(pointInPolygon(55.2, 10.05, sq)).toBe(false);
    expect(pointInPolygon(55.05, 9.9, sq)).toBe(false);
  });

  it("меньше 3 вершин — false", () => {
    expect(pointInPolygon(55.05, 10.05, [[55, 10], [55, 10.1]])).toBe(false);
  });
});

describe("pointInCircle", () => {
  it("точка внутри и снаружи круга радиусом 100 км", () => {
    const c: [number, number] = [55.0, 10.0];
    expect(pointInCircle(55.5, 10.0, c, 100_000)).toBe(true); // ~55.5 км к северу
    expect(pointInCircle(56.0, 10.0, c, 100_000)).toBe(false); // ~111 км
  });
});
