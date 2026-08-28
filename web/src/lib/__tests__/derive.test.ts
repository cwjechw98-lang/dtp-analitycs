import { describe, expect, it } from "vitest";
import { deriveRegion, deriveRegionCulprits, COL } from "../derive";
import type { Dictionaries, PointRow } from "../types";

const dicts: Dictionaries = {
  cats: ["Столкновение"],
  sevs: ["Легкий", "Тяжёлый", "С погибшими"],
  lights: ["Светлое время суток"],
  weathers: ["Ясно"],
  roads: ["Сухое"],
  brands: ["ВАЗ", "TOYOTA"],
  veh_supers: ["passenger_car", "truck"],
  part_types: ["driver", "pedestrian"],
  outcome_groups: ["not_injured", "fatal_on_scene"],
  infra_facets: ["pedestrian_crossing", "intersection"],
};

function row(over: Partial<Record<number, number>>): PointRow {
  const base: PointRow = [
    54.99, 73.32, 202406, 4, 18, 0, 0, 0, 0, 0, -1, -1, 0, 0, -2, 1,
  ];
  for (const [k, v] of Object.entries(over)) base[Number(k)] = v as number;
  return base;
}

describe("deriveRegion", () => {
  const rows = [
    row({}),                                        // базовая: июнь 2024, пт 18ч, лёгкое
    row({ [COL.SEV]: 2, [COL.DEAD]: 2, [COL.INJ]: 3 }),
    row({ [COL.YM]: 202301, [COL.HOUR]: 3 }),       // январь 2023, ночь
  ];

  const d = deriveRegion(rows, dicts);

  it("считает итоги", () => {
    expect(d.total).toBe(3);
    expect(d.dead).toBe(2);
    expect(d.injured).toBe(3);
  });

  it("по годам", () => {
    const y2024 = d.overview.by_year.find((y) => y.year === 2024)!;
    const y2023 = d.overview.by_year.find((y) => y.year === 2023)!;
    expect(y2024.accidents).toBe(2);
    expect(y2023.accidents).toBe(1);
    expect(d.temporal.years).toEqual([2023, 2024]);
  });

  it("тяжесть и время суток", () => {
    expect(d.overview.severity_totals).toEqual([2, 0, 1]);
    expect(d.temporal.tod_severity[3][2]).toBe(1); // вечер, погибшие
    expect(d.temporal.by_hour[3]).toBe(1);         // ночь 3 часа
  });

  it("сезоны через seasonOfYm", () => {
    expect(d.temporal.season_counts["Лето"]).toBe(2);
    expect(d.temporal.season_counts["Зима"]).toBe(1);
  });

  it("категории с именами словаря", () => {
    expect(d.overview.categories[0]).toEqual(["Столкновение", 3]);
  });
});

describe("deriveRegionCulprits", () => {
  it("раскладывает по виновникам", () => {
    const rows = [
      row({ [COL.CULPRIT]: 0 }),           // ВАЗ виновник
      row({ [COL.CULPRIT]: 0 }),           // снова ВАЗ
      row({ [COL.CULPRIT]: 1 }),           // TOYOTA
      row({ [COL.CULPRIT]: -2 }),          // виновник не за рулём
      row({ [COL.CULPRIT]: -1, [COL.VEH_COUNT]: 0 }), // нет ТС
    ];
    const c = deriveRegionCulprits(rows);
    expect(c.withVehicleCulprit).toBe(3);
    expect(c.pedestrianOnly).toBe(1);
    expect(c.noInfo).toBe(1);
    expect(c.byBrand[0]).toEqual({ idx: 0, count: 2 });
    expect(c.byBrand[1].idx).toBe(1);
  });
});
