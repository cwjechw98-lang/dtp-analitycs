import { describe, expect, it } from "vitest";
import { runResearchFindings } from "../researchFindings";
import type { Dictionaries } from "../types";
import { COL } from "../derive";

const d: Dictionaries = {
  cats: ["Столкновение", "Наезд на пешехода", "Опрокидывание"],
  sevs: ["Легкий", "Тяжёлый", "С погибшими"],
  lights: ["Светлое время суток"],
  weathers: ["Ясно"],
  roads: ["Сухое"],
  brands: [],
  veh_supers: ["passenger_car", "truck", "bus", "motorcycle"],
  part_types: ["driver", "passenger", "pedestrian", "cyclist"],
  outcome_groups: ["not_injured", "outpatient", "hospitalized", "fatal_on_scene"],
  infra_facets: ["intersection", "pedestrian_crossing"],
};

function row(over: Partial<Record<number, number>>): number[] {
  const r = new Array(21).fill(0);
  r[COL.LAT] = 55; r[COL.LON] = 73; r[COL.YM] = 202406; r[COL.HOUR] = 12; r[COL.SEV] = 0;
  for (const [k, v] of Object.entries(over)) r[Number(k)] = v as number;
  return r;
}

describe("runResearchFindings", () => {
  it("пустой срез не даёт находок", () => {
    const slice = [row({})];
    const base = [row({}), row({})];
    expect(runResearchFindings(slice, base, d)).toEqual([]);
  });

  it("выделяет перепредставленную категорию ДТП", () => {
    // срез: 40 съездов (cat=2), база: смесь
    const slice = Array.from({ length: 40 }, () => row({ [COL.CAT]: 2 }));
    const base = [
      ...Array.from({ length: 40 }, () => row({ [COL.CAT]: 2 })),
      ...Array.from({ length: 300 }, () => row({ [COL.CAT]: 0 })),
    ];
    const f = runResearchFindings(slice, base, d).find((x) => x.type === "category_overrepresentation");
    expect(f).toBeTruthy();
    expect(f!.warns).toBe(true);
  });

  it("severity difference: срез тяжелее базы", () => {
    const slice = Array.from({ length: 30 }, () => row({ [COL.SEV]: 2 }));
    const base = [
      ...Array.from({ length: 30 }, () => row({ [COL.SEV]: 2 })),
      ...Array.from({ length: 300 }, () => row({ [COL.SEV]: 0 })),
    ];
    const f = runResearchFindings(slice, base, d).find((x) => x.type === "severity_difference");
    expect(f).toBeTruthy();
  });
});
