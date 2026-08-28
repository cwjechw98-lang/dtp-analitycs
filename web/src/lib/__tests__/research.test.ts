import { describe, expect, it } from "vitest";
import { rowPasses, filterFromUrl } from "../research";
import type { Dictionaries } from "../types";
import { COL } from "../derive";

const dicts: Dictionaries = {
  cats: ["Столкновение"],
  sevs: ["Легкий", "Тяжёлый", "С погибшими"],
  lights: ["Светлое время суток"],
  weathers: ["Ясно"],
  roads: ["Сухое"],
  brands: ["ВАЗ", "TOYOTA"],
  veh_supers: ["passenger_car", "truck", "bus", "motorcycle", "bicycle", "personal_mobility", "special_vehicle", "trailer", "rail_vehicle", "other"],
  part_types: ["driver", "passenger", "pedestrian", "cyclist", "motorcyclist", "road_worker", "traffic_police", "public_safety_worker", "other"],
  outcome_groups: ["not_injured", "outpatient", "minor_injury", "hospitalized", "fatal_on_scene", "fatal_transport", "fatal_afterwards"],
  infra_facets: ["intersection", "pedestrian_crossing", "public_transport", "railway", "bridge_tunnel", "roadside_service", "education_children", "residential", "none", "road_context", "poi_other"],
};

function row(opts?: { sev?: number; vehSupers?: number[]; partTypes?: number[]; outcomes?: number[]; infra?: number[]; year?: number }): number[] {
  const r = new Array(21).fill(0);
  r[COL.LAT] = 55; r[COL.LON] = 73; r[COL.YM] = (opts?.year ?? 2024) * 100 + 6;
  r[COL.SEV] = opts?.sev ?? 0;
  let m = 0; for (const i of opts?.vehSupers ?? []) m |= 1 << i; r[COL.VEH_SUPERS] = m;
  m = 0; for (const i of opts?.partTypes ?? []) m |= 1 << i; r[COL.PART_TYPES] = m;
  m = 0; for (const i of opts?.outcomes ?? []) m |= 1 << i; r[COL.OUTCOMES] = m;
  m = 0; for (const i of opts?.infra ?? []) m |= 1 << i; r[COL.INFRA] = m;
  return r;
}

describe("rowPasses", () => {
  it("пустой фильтр пропускает всё", () => {
    expect(rowPasses(row(), {})).toBe(true);
  });
  it("северити фильтрует", () => {
    expect(rowPasses(row({ sev: 2 }), { severities: [2] })).toBe(true);
    expect(rowPasses(row({ sev: 0 }), { severities: [2] })).toBe(false);
  });
  it("vehSupers требует совпадение хотя бы одного бита", () => {
    const r = row({ vehSupers: [0, 1] }); // passenger_car | truck
    expect(rowPasses(r, { vehSupers: [0] })).toBe(true);
    expect(rowPasses(r, { vehSupers: [2] })).toBe(false);
  });
  it("partTypes тоже OR", () => {
    const r = row({ partTypes: [0] }); // driver
    expect(rowPasses(r, { partTypes: [0, 1] })).toBe(true);
  });
  it("infra мульти-фасет OR", () => {
    const r = row({ infra: [0, 1] }); // intersection | pedestrian_crossing
    expect(rowPasses(r, { infra: [1] })).toBe(true);
    expect(rowPasses(r, { infra: [5] })).toBe(false);
  });
  it("год диапазон", () => {
    expect(rowPasses(row({ year: 2021 }), { yearMin: 2021, yearMax: 2025 })).toBe(true);
    expect(rowPasses(row({ year: 2020 }), { yearMin: 2021, yearMax: 2025 })).toBe(false);
  });
});

describe("filterFromUrl", () => {
  it("парсит y, sev, veh, part, out, inf", () => {
    const url = new URL("https://x/?y=2021-2025&sev=fatal,heavy&veh=car,moto&part=driver&out=fatal_on_scene&inf=pedestrian_crossing");
    const f = filterFromUrl(url, dicts);
    expect(f.yearMin).toBe(2021);
    expect(f.yearMax).toBe(2025);
    expect(f.severities).toEqual([2, 1]);
    expect(f.vehSupers).toEqual([0, 3]); // passenger_car, motorcycle
    expect(f.partTypes).toEqual([0]);
  });
  it("однозначный год", () => {
    const f = filterFromUrl(new URL("https://x/?y=2024"), dicts);
    expect(f.yearMin).toBe(2024);
    expect(f.yearMax).toBe(2024);
  });
});
