import { describe, expect, it } from "vitest";
import { bestHours, matchRules, regionByPoint, ruleMatches, seasonOfMonth, todOfHour } from "../tips";
import type { MetaRegion, TipRule } from "../types";

const rule = (id: string, when: TipRule["when"], lift = 1.3, n = 1000): TipRule => ({
  id,
  scope: "time",
  when,
  lift,
  n,
  title: id,
  text: "",
  tags: [],
});

const ctx = {
  hour: 19,
  weekday: "Пт",
  season: "Зима",
  tod: "Вечер",
  experienceBucket: "0–2" as string | null,
  roadConditions: ["Гололедица"],
};

describe("todOfHour", () => {
  it("режет сутки на те же четыре куска, что и пайплайн", () => {
    expect(todOfHour(23)).toBe("Ночь");
    expect(todOfHour(5)).toBe("Ночь");
    expect(todOfHour(6)).toBe("Утро");
    expect(todOfHour(12)).toBe("День");
    expect(todOfHour(18)).toBe("Вечер");
    expect(todOfHour(22)).toBe("Вечер");
  });
});

describe("seasonOfMonth", () => {
  it("декабрь относится к зиме, а не к осени", () => {
    expect(seasonOfMonth(12)).toBe("Зима");
    expect(seasonOfMonth(1)).toBe("Зима");
    expect(seasonOfMonth(6)).toBe("Лето");
    expect(seasonOfMonth(9)).toBe("Осень");
  });
});

describe("ruleMatches", () => {
  it("пустое условие подходит всегда", () => {
    expect(ruleMatches(rule("r", {}), ctx)).toBe(true);
  });

  it("все указанные ключи должны совпасть", () => {
    expect(ruleMatches(rule("r", { season: "Зима", tod: "Вечер" }), ctx)).toBe(true);
    expect(ruleMatches(rule("r", { season: "Зима", tod: "Утро" }), ctx)).toBe(false);
  });

  it("диапазон часов через полночь не разрывается", () => {
    const night = rule("n", { hour_from: 22, hour_to: 4 });
    expect(ruleMatches(night, { ...ctx, hour: 23 })).toBe(true);
    expect(ruleMatches(night, { ...ctx, hour: 2 })).toBe(true);
    expect(ruleMatches(night, { ...ctx, hour: 12 })).toBe(false);
  });

  it("правило по стажу молчит, когда стаж не указан", () => {
    const r = rule("e", { experience_bucket: "0–2" });
    expect(ruleMatches(r, ctx)).toBe(true);
    expect(ruleMatches(r, { ...ctx, experienceBucket: null })).toBe(false);
  });

  it("правило по покрытию молчит, когда покрытия неизвестны", () => {
    const r = rule("road", { road_condition: "Гололедица" });
    expect(ruleMatches(r, ctx)).toBe(true);
    expect(ruleMatches(r, { ...ctx, roadConditions: [] })).toBe(false);
    expect(ruleMatches(r, { ...ctx, roadConditions: undefined })).toBe(false);
  });
});

describe("matchRules", () => {
  it("делит на повышающие и понижающие, каждую группу по силе эффекта", () => {
    const rules = [
      rule("mild", { tod: "Вечер" }, 1.2),
      rule("strong", { tod: "Вечер" }, 1.9),
      rule("calm", { tod: "Вечер" }, 0.5),
      rule("miss", { tod: "Утро" }, 3.0),
    ];
    const { risky, calm } = matchRules(rules, ctx);
    expect(risky.map((r) => r.id)).toEqual(["strong", "mild"]);
    expect(calm.map((r) => r.id)).toEqual(["calm"]);
  });
});

describe("bestHours", () => {
  it("находит часы, где не срабатывает повышающее правило", () => {
    const rules = [rule("evening", { hour_from: 17, hour_to: 20 }, 2.0)];
    const best = bestHours(rules, ctx, 3);
    expect(best.every((b) => b.hour < 17 || b.hour > 20)).toBe(true);
    expect(best[0].score).toBe(1);
  });

  it("перемножает эффекты, а не складывает", () => {
    const rules = [rule("a", { hour_from: 8, hour_to: 8 }, 2), rule("b", { hour_from: 8, hour_to: 8 }, 3)];
    const all = bestHours(rules, ctx, 24);
    expect(all.find((x) => x.hour === 8)!.score).toBeCloseTo(6);
  });
});

describe("regionByPoint", () => {
  const regions: MetaRegion[] = [
    { slug: "big", name: "Большой", total: 1, date_min: null, date_max: null, bbox: [50, 60, 70, 90] },
    { slug: "small", name: "Малый", total: 1, date_min: null, date_max: null, bbox: [54, 56, 72, 75] },
  ];

  it("из перекрывающихся bbox выбирает компактный", () => {
    expect(regionByPoint(regions, 55, 73)?.slug).toBe("small");
  });

  it("вне всех bbox возвращает null", () => {
    expect(regionByPoint(regions, 10, 10)).toBeNull();
  });
});
