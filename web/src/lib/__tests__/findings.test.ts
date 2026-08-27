import { describe, expect, it } from "vitest";
import { MIN_N, compareBrands, isRealBrand, plural, verdict } from "../findings";
import type { BrandDetail } from "../types";

/** Марка-заготовка: доли задаются явно, чтобы проверять именно пороги. */
function brand(o: Partial<BrandDetail> & { total: number }): BrandDetail {
  const t = o.total;
  return {
    total: t,
    sev: o.sev ?? [Math.round(t * 0.35), Math.round(t * 0.55), Math.round(t * 0.1)],
    culprit: o.culprit ?? Math.round(t * 0.6),
    victim: o.victim ?? Math.round(t * 0.4),
    violations: o.violations ?? [["Превышение скорости", Math.round(t * 0.2)]],
    by_year: o.by_year ?? [
      ["2015", Math.round(t * 0.12)],
      ["2024", Math.round(t * 0.08)],
      ["2025", Math.round(t * 0.02)],
    ],
    by_region: o.by_region ?? [["Регион А", t]],
  };
}

describe("пороги", () => {
  it("молчит, когда выборка меньше MIN_N", () => {
    const small = brand({ total: MIN_N - 1, sev: [10, 10, 229] });
    const big = brand({ total: 100_000 });
    const f = compareBrands({ nameA: "A", a: small, nameB: "B", b: big });
    expect(f.filter((x) => x.kind === "inferential")).toHaveLength(0);
  });

  it("молчит, когда разница не дотягивает ни до одного порога", () => {
    const a = brand({ total: 100_000 });
    const b = brand({ total: 100_000 });
    const f = compareBrands({ nameA: "A", a, nameB: "B", b });
    expect(verdict(f)).toBeNull();
  });

  it("выдаёт находку, когда разница долей заметная", () => {
    const a = brand({ total: 100_000, sev: [30_000, 55_000, 15_000] });
    const b = brand({ total: 100_000, sev: [45_000, 50_000, 5_000] });
    const f = compareBrands({ nameA: "A", a, nameB: "B", b });
    const v = verdict(f);
    expect(v).not.toBeNull();
    expect(v!.text).toContain("A");
    expect(v!.n).toBeGreaterThanOrEqual(MIN_N);
  });
});

describe("вердикт", () => {
  it("всегда выводная находка, а не описательная", () => {
    const a = brand({ total: 100_000, sev: [30_000, 55_000, 15_000], by_region: [["Р1", 1]] });
    const b = brand({ total: 100_000, sev: [45_000, 50_000, 5_000], by_region: [["Р9", 1]] });
    const v = verdict(compareBrands({ nameA: "A", a, nameB: "B", b }));
    expect(v?.kind).toBe("inferential");
  });

  it("выводные стоят выше описательных в общем списке", () => {
    const a = brand({ total: 100_000, sev: [30_000, 55_000, 15_000] });
    const b = brand({ total: 100_000, sev: [45_000, 50_000, 5_000] });
    const f = compareBrands({ nameA: "A", a, nameB: "B", b });
    const lastInf = f.map((x) => x.kind).lastIndexOf("inferential");
    const firstDesc = f.map((x) => x.kind).indexOf("descriptive");
    if (firstDesc >= 0) expect(lastInf).toBeLessThan(firstDesc);
  });
});

describe("формулировки", () => {
  it("не ломает аббревиатуры нижним регистром", () => {
    const a = brand({
      total: 100_000,
      violations: [["Нарушение расположения ТС на проезжей части", 30_000]],
    });
    const b = brand({
      total: 100_000,
      violations: [["Нарушение расположения ТС на проезжей части", 10_000]],
    });
    const f = compareBrands({ nameA: "A", a, nameB: "B", b });
    const v = f.find((x) => x.id === "violation");
    expect(v?.text).toContain("ТС");
    expect(v?.text).not.toContain("тс на проезжей");
  });

  it("не выдаёт NaN и пустых разниц", () => {
    const a = brand({ total: 100_000, sev: [30_000, 55_000, 15_000] });
    const b = brand({ total: 300, sev: [100, 150, 50] });
    for (const r of compareBrands({ nameA: "A", a, nameB: "B", b })) {
      expect(r.text).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe("география", () => {
  it("не утверждает отсутствие региона — только что он вне топа", () => {
    const a = brand({ total: 100_000, by_region: [["Р1", 5], ["Р2", 4], ["Прочие", 3]] });
    const b = brand({ total: 100_000, by_region: [["Р8", 5], ["Р9", 4], ["Прочие", 3]] });
    const geo = compareBrands({ nameA: "A", a, nameB: "B", b }).find((x) => x.id === "geo");
    expect(geo?.text).toContain("топ-регионах");
    expect(geo?.text).not.toMatch(/не бывает|отсутству|никогда|ноль/i);
  });
});

describe("isRealBrand", () => {
  it("отсеивает корзины «прочие»", () => {
    expect(isRealBrand("ВАЗ")).toBe(true);
    expect(isRealBrand("Прочие марки ТС")).toBe(false);
    expect(isRealBrand("Прочие марки мотоциклов")).toBe(false);
  });
});

describe("русская типографика", () => {
  it("склоняет по числу правильно, включая 11–14", () => {
    const p = (n: number) => plural(n, "отличие", "отличия", "отличий");
    expect([1, 2, 5, 11, 14, 21, 22, 25, 111].map(p)).toEqual([
      "отличие",
      "отличия",
      "отличий",
      "отличий",
      "отличий",
      "отличие",
      "отличия",
      "отличий",
      "отличий",
    ]);
  });

  it("в формулировках запятая, а не точка", () => {
    const a = brand({ total: 100_000, sev: [30_000, 55_000, 15_000] });
    const b = brand({ total: 100_000, sev: [45_000, 50_000, 5_000] });
    for (const f of compareBrands({ nameA: "A", a, nameB: "B", b })) {
      // Цифра-точка-цифра — признак несклонённой дроби. Проценты и разы
      // в русском тексте пишутся через запятую.
      expect(f.text).not.toMatch(/\d\.\d/);
    }
  });
});
