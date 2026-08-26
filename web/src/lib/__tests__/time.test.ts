import { describe, expect, it } from "vitest";
import { geohashDecode } from "../geo";
import { seasonOfMonth, seasonOfYm, todOf } from "../time";

describe("geohashDecode", () => {
  const cases: [string, number, number][] = [
    ["v9u0u", 54.9885, 73.3242],   // Омск
    ["udtsc", 59.9386, 30.3141],   // Санкт-Петербург
    ["ucfv0", 55.7558, 37.6173],   // Москва
    ["gcpvj", 51.5074, -0.1278],   // Лондон
    ["r3gx2", -33.8688, 151.2093], // Сидней
  ];

  for (const [hash, lat, lon] of cases) {
    it(`декодирует ${hash} около (${lat}, ${lon})`, () => {
      const [dLat, dLon] = geohashDecode(hash);
      expect(Math.abs(dLat - lat)).toBeLessThan(0.05); // ячейка ~4.9 км
      expect(Math.abs(dLon - lon)).toBeLessThan(0.07);
    });
  }

  it("бросает исключение на мусорном символе", () => {
    expect(() => geohashDecode("zzz!a")).toThrow();
  });
});

describe("todOf", () => {
  it("границы времени суток", () => {
    expect(todOf(23)).toBe(0);
    expect(todOf(5)).toBe(0);
    expect(todOf(6)).toBe(1);
    expect(todOf(11)).toBe(1);
    expect(todOf(12)).toBe(2);
    expect(todOf(17)).toBe(2);
    expect(todOf(18)).toBe(3);
    expect(todOf(22)).toBe(3);
  });
});

describe("seasonOfYm / seasonOfMonth", () => {
  it("месяцы → сезоны", () => {
    expect(seasonOfMonth(12)).toBe(0);
    expect(seasonOfMonth(1)).toBe(0);
    expect(seasonOfMonth(2)).toBe(0);
    expect(seasonOfMonth(4)).toBe(1);
    expect(seasonOfMonth(7)).toBe(2);
    expect(seasonOfMonth(10)).toBe(3);
  });

  it("yyyymm → сезон", () => {
    expect(seasonOfYm(202401)).toBe(0);
    expect(seasonOfYm(202407)).toBe(2);
    expect(seasonOfYm(202412)).toBe(0);
  });
});
