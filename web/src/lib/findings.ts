import type { BrandDetail } from "./types";

/**
 * Движок находок (план v3, раздел 3).
 *
 * Ищет в данных различия, о которых можно сказать вслух, и молчит там, где
 * выборки не хватает. Никакого сочинения: код находит разницу, формулировка
 * собирается по шаблону из тех же чисел.
 *
 * Два класса утверждений, и путать их нельзя:
 *
 *   inferential — сравнение с базой («доля выше, чем у другой марки»).
 *     Требует порогов: без них это гадание, выданное за вывод.
 *
 *   descriptive — счёт внутри выборки («на 14 км трассы 90 из 1040 ДТП»).
 *     Порога не требует, потому что ничего не выводит, но обязан
 *     показывать абсолютное число рядом с долей.
 *
 * Причины не объясняются никогда. «Доля виновника выше» — можно.
 * «Водители агрессивнее» — нельзя: это интерпретация, которую данные
 * не подтверждают.
 */

// ---- пороги ----

/** Минимальная выборка в каждой сравниваемой группе. */
export const MIN_N = 250;
/** Минимальная относительная разница для выводных находок. */
export const MIN_REL = 0.15;
/** Минимальная разница долей в процентных пунктах. */
export const MIN_PP = 0.02;

export type FindingKind = "inferential" | "descriptive";

export interface Finding {
  id: string;
  kind: FindingKind;
  /** готовая формулировка для вердикта */
  text: string;
  /** насколько находка сильная — для сортировки, не для показа */
  weight: number;
  /** выборка, на которой построено утверждение */
  n: number;
  /** пары «подпись → значение» для доказательной части */
  evidence: [string, string][];
  /**
   * Находка предупреждает (здесь хуже) или успокаивает (здесь лучше).
   *
   * Явное поле, а не разбор готового текста регуляркой: в JavaScript
   * граница слова \b определена только для латиницы, поэтому
   * /\bреже\b/ на кириллице не совпадает НИКОГДА. Такая проверка
   * молча возвращала бы «предупреждает» для всех находок подряд.
   */
  warns?: boolean;
}

/** Русская дробь: toFixed даёт точку, а в тексте нужна запятая. */
const dec = (x: number, digits = 1) => x.toFixed(digits).replace(".", ",");
const pct = (x: number, digits = 1) => `${dec(x * 100, digits)}%`;

/**
 * Склонение по числу: «1 отличие», «3 отличия», «5 отличий».
 * Нужно везде, где число подставляется в текст карточки.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
/**
 * Строчная только первая буква: toLowerCase() ломал аббревиатуры
 * («ТС» превращалось в «тс»).
 */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const num = (x: number) => Math.round(x).toLocaleString("ru-RU");

/**
 * Выводная находка: пропускает только то, что прошло оба порога.
 * Возвращает null, если разница слишком мала или выборка недостаточна —
 * вызывающий просто отбрасывает такие.
 */
function inferential(
  id: string,
  shareA: number,
  shareB: number,
  nA: number,
  nB: number,
  text: (relative: number, deltaPp: number) => string,
  evidence: [string, string][],
  warns = true,
): Finding | null {
  if (nA < MIN_N || nB < MIN_N) return null;
  const deltaPp = Math.abs(shareA - shareB);
  const base = Math.min(shareA, shareB);
  const relative = base > 0 ? Math.abs(shareA - shareB) / base : 0;
  // Достаточно пройти любой из порогов: относительный ловит малые доли
  // (8% против 10% — это четверть разницы), абсолютный — большие
  // (60% против 63% относительно мало, но 3 п.п. заметны).
  if (relative < MIN_REL && deltaPp < MIN_PP) return null;
  return {
    id,
    kind: "inferential",
    text: text(relative, deltaPp),
    weight: Math.max(relative, deltaPp * 5),
    n: Math.min(nA, nB),
    evidence,
    warns,
  };
}

function descriptive(
  id: string,
  text: string,
  weight: number,
  n: number,
  evidence: [string, string][],
): Finding {
  return { id, kind: "descriptive", text, weight, n, evidence };
}

// ---- сравнение двух марок ----

const severeShare = (b: BrandDetail) => (b.sev[1] + b.sev[2]) / b.total;
const deathShare = (b: BrandDetail) => b.sev[2] / b.total;
const culpritShare = (b: BrandDetail) => b.culprit / b.total;

/** Доли нарушений внутри виновников марки. */
function violationShares(b: BrandDetail): Map<string, number> {
  const m = new Map<string, number>();
  for (const [name, count] of b.violations) m.set(name, count / b.culprit);
  return m;
}

/**
 * Псевдо-марки из агрегата: это корзины «всё остальное», а не марки.
 * Сравнивать с ними бессмысленно — внутри смесь из сотен моделей.
 */
export function isRealBrand(name: string): boolean {
  return !/^прочие/i.test(name.trim());
}

export interface BrandPair {
  nameA: string;
  a: BrandDetail;
  nameB: string;
  b: BrandDetail;
}

export function compareBrands({ nameA, a, nameB, b }: BrandPair): Finding[] {
  const out: (Finding | null)[] = [];

  // --- смертность: самая выразительная метрика, идёт первой ---
  {
    const [sA, sB] = [deathShare(a), deathShare(b)];
    const [hi, lo] = sA >= sB ? [nameA, nameB] : [nameB, nameA];
    out.push(
      inferential(
        "death",
        sA,
        sB,
        a.total,
        b.total,
        (rel) =>
          `В ДТП с ${hi} погибшие встречаются в ${dec(1 + rel)} раза чаще, чем в ДТП с ${lo}: ` +
          `${pct(Math.max(sA, sB))} против ${pct(Math.min(sA, sB))} происшествий.`,
        [
          [`${nameA} — с погибшими`, `${pct(sA)} (${num(a.sev[2])})`],
          [`${nameB} — с погибшими`, `${pct(sB)} (${num(b.sev[2])})`],
        ],
      ),
    );
  }

  // --- тяжесть в целом ---
  {
    const [sA, sB] = [severeShare(a), severeShare(b)];
    const [hi, lo] = sA >= sB ? [nameA, nameB] : [nameB, nameA];
    out.push(
      inferential(
        "severe",
        sA,
        sB,
        a.total,
        b.total,
        (_rel, pp) =>
          `Тяжёлые последствия у ${hi} на ${dec(pp * 100)} п.п. чаще, чем у ${lo}: ` +
          `${pct(Math.max(sA, sB))} против ${pct(Math.min(sA, sB))}.`,
        [
          [`${nameA} — тяжёлые и с погибшими`, pct(sA)],
          [`${nameB} — тяжёлые и с погибшими`, pct(sB)],
        ],
      ),
    );
  }

  // --- вина ---
  {
    const [sA, sB] = [culpritShare(a), culpritShare(b)];
    const [hi, lo] = sA >= sB ? [nameA, nameB] : [nameB, nameA];
    out.push(
      inferential(
        "culprit",
        sA,
        sB,
        a.total,
        b.total,
        (_rel, pp) =>
          `Водителя ${hi} признают виновником на ${dec(pp * 100)} п.п. чаще, чем водителя ${lo}: ` +
          `${pct(Math.max(sA, sB))} против ${pct(Math.min(sA, sB))} случаев.`,
        [
          [`${nameA} — виновник`, `${pct(sA)} (${num(a.culprit)})`],
          [`${nameB} — виновник`, `${pct(sB)} (${num(b.culprit)})`],
        ],
      ),
    );
  }

  // --- характерное нарушение ---
  {
    const va = violationShares(a);
    const vb = violationShares(b);
    let best: { name: string; sa: number; sb: number } | null = null;
    for (const name of new Set([...va.keys(), ...vb.keys()])) {
      const sa = va.get(name) ?? 0;
      const sb = vb.get(name) ?? 0;
      // Нарушение, которого нет в топе одной из марок, сравнивать нельзя:
      // список обрезан, и ноль означает «не в топе», а не «не бывает».
      if (!sa || !sb) continue;
      if (!best || Math.abs(sa - sb) > Math.abs(best.sa - best.sb)) best = { name, sa, sb };
    }
    if (best) {
      const [hi, lo] = best.sa >= best.sb ? [nameA, nameB] : [nameB, nameA];
      out.push(
        inferential(
          "violation",
          best.sa,
          best.sb,
          a.culprit,
          b.culprit,
          (_rel, pp) =>
            `Среди виновников на ${hi} чаще фиксируют «${lowerFirst(best!.name)}» — ` +
            `на ${dec(pp * 100)} п.п. больше, чем у ${lo}.`,
          [
            [`${nameA}`, pct(best.sa)],
            [`${nameB}`, pct(best.sb)],
          ],
        ),
      );
    }
  }

  // --- динамика ---
  {
    const trend = (x: BrandDetail) => {
      const ys = [...x.by_year].sort((p, q) => p[0].localeCompare(q[0]));
      // Последний год почти всегда неполный — берём предпоследний,
      // иначе у всех марок нарисуется фальшивое обвальное падение.
      const first = ys[0];
      const last = ys[ys.length - 2] ?? ys[ys.length - 1];
      if (!first || !last || !first[1]) return null;
      return { from: first, to: last, change: last[1] / first[1] - 1 };
    };
    const ta = trend(a);
    const tb = trend(b);
    if (ta && tb && Math.abs(ta.change - tb.change) >= MIN_REL) {
      const fast = ta.change < tb.change ? nameA : nameB;
      const fastT = ta.change < tb.change ? ta : tb;
      const slow = ta.change < tb.change ? nameB : nameA;
      const slowT = ta.change < tb.change ? tb : ta;
      out.push(
        descriptive(
          "trend",
          `С ${fastT.from[0]} года ДТП с ${fast} стало меньше на ${Math.round(Math.abs(fastT.change * 100))}%, ` +
            `с ${slow} — на ${Math.round(Math.abs(slowT.change * 100))}%.`,
          Math.abs(ta.change - tb.change),
          Math.min(a.total, b.total),
          [
            [`${nameA}: ${ta.from[0]} → ${ta.to[0]}`, `${num(ta.from[1])} → ${num(ta.to[1])}`],
            [`${nameB}: ${tb.from[0]} → ${tb.to[0]}`, `${num(tb.from[1])} → ${num(tb.to[1])}`],
          ],
        ),
      );
    }
  }

  // --- география ---
  {
    // by_region обрезан до топ-12 плюс «прочие». Отсутствие региона в списке
    // НЕ означает ноль, поэтому единственная допустимая формулировка —
    // «входит в топ у одной и не входит у другой».
    const topOf = (x: BrandDetail) =>
      new Set(x.by_region.filter(([r]) => r !== "Прочие" && r !== "прочие").map(([r]) => r));
    const ta = topOf(a);
    const tb = topOf(b);
    const onlyA = [...ta].filter((r) => !tb.has(r));
    const onlyB = [...tb].filter((r) => !ta.has(r));
    if (onlyA.length >= 2 && onlyB.length >= 2) {
      out.push(
        descriptive(
          "geo",
          `География разная: у ${nameA} в топ-регионах ${onlyA.slice(0, 2).join(" и ")}, ` +
            `у ${nameB} — ${onlyB.slice(0, 2).join(" и ")}.`,
          0.3,
          Math.min(a.total, b.total),
          [
            [`Только у ${nameA}`, onlyA.slice(0, 3).join(", ")],
            [`Только у ${nameB}`, onlyB.slice(0, 3).join(", ")],
          ],
        ),
      );
    }
  }

  // Выводные всегда выше описательных: вердиктом должно становиться
  // утверждение о различии, а не констатация факта. Веса у разных типов
  // несопоставимы между собой, поэтому сравнивать их напрямую нельзя.
  // Выводные всегда выше описательных: вердиктом должно становиться
  // утверждение о различии, а не констатация факта. Веса у разных типов
  // несопоставимы между собой, поэтому сравнивать их напрямую нельзя.
  const rank = (f: Finding) => (f.kind === "inferential" ? 0 : 1);
  return (out.filter(Boolean) as Finding[]).sort(
    (x, y) => rank(x) - rank(y) || y.weight - x.weight,
  );
}

/**
 * Главный вердикт — сильнейшая выводная находка.
 *
 * Если выводных нет, это не пустота, а сам по себе результат: марки
 * статистически неразличимы, и сказать об этом честнее, чем выдать
 * описательный факт за вывод.
 */
export function verdict(findings: Finding[]): Finding | null {
  return findings.find((f) => f.kind === "inferential") ?? null;
}

/** Формулировка на случай, когда различий не нашлось. */
export function noDifferenceText(nameA: string, nameB: string): string {
  return (
    `По ключевым показателям ${nameA} и ${nameB} статистически неразличимы: ` +
    `разница в тяжести, вине и нарушениях не выходит за порог значимости.`
  );
}

/* ==================== находки по коридору маршрута ==================== */

/**
 * Маршрутные находки (план v3, раздел «Почему это важно именно для маршрута»).
 *
 * Ключевое отличие от сравнения марок: типичный коридор — около тысячи ДТП,
 * и любое дробление роняет ячейку ниже порога. Дождь даёт ~120 случаев,
 * дождь плюс тяжёлый исход ~78, отдельный участок ~90.
 *
 * Поэтому ВЫВОДНЫЕ находки строятся только на коридоре ЦЕЛИКОМ против
 * национальной базы, где n равен всему коридору. Всё, что мельче —
 * описательные утверждения со счётом.
 */

export interface CorridorInput {
  total: number;
  /** доля тяжёлых и с погибшими */
  severeShare: number;
  dead: number;
  /** [категория, число] по коридору */
  topCats: [string, number][];
  /** [название погоды, число] по коридору */
  topWeathers: [string, number][];
  worstHours: { h: number; c: number; lift: number }[];
}

export interface NationalBaseline {
  total: number;
  /** [лёгкие, тяжёлые, с погибшими] по стране */
  severityTotals: [number, number, number];
  categories: [string, number][];
  weathers: [string, number][];
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function corridorFindings(c: CorridorInput, base: NationalBaseline): Finding[] {
  const out: (Finding | null)[] = [];
  if (c.total <= 0 || base.total <= 0) return [];

  const baseSevere = (base.severityTotals[1] + base.severityTotals[2]) / base.total;
  const baseDeath = base.severityTotals[2] / base.total;

  // --- тяжесть коридора против страны ---
  out.push(
    inferential(
      "corridor-severe",
      c.severeShare,
      baseSevere,
      c.total,
      base.total,
      (_rel, pp) =>
        c.severeShare > baseSevere
          ? `Последствия здесь тяжелее обычного: ${pct(c.severeShare)} происшествий с пострадавшими или погибшими против ${pct(baseSevere)} в среднем по стране.`
          : `Последствия здесь легче среднего: ${pct(c.severeShare)} против ${pct(baseSevere)} по стране — разница ${dec(pp * 100)} п.п.`,
      [
        ["На маршруте", pct(c.severeShare)],
        ["В среднем по России", pct(baseSevere)],
      ],
      c.severeShare > baseSevere,
    ),
  );

  // --- смертность коридора против страны ---
  {
    const share = c.dead / c.total;
    out.push(
      inferential(
        "corridor-death",
        share,
        baseDeath,
        c.total,
        base.total,
        (rel) =>
          share > baseDeath
            ? `Погибшие на этом маршруте встречаются в ${dec(1 + rel)} раза чаще, чем в среднем по стране.`
            : `Погибшие здесь встречаются реже среднего: ${pct(share)} против ${pct(baseDeath)}.`,
        [
          ["Погибших на маршруте", `${num(c.dead)} из ${num(c.total)} ДТП`],
          ["Доля по стране", pct(baseDeath)],
        ],
        share > baseDeath,
      ),
    );
  }

  // --- характерный тип происшествия ---
  {
    const baseByCat = new Map(base.categories);
    let best: { name: string; sc: number; sb: number } | null = null;
    for (const [name, count] of c.topCats.slice(0, 6)) {
      const bn = baseByCat.get(name);
      // Категории, которой нет в национальном топе, сравнивать не с чем:
      // список обрезан, и отсутствие не означает ноль.
      if (!bn) continue;
      const sc = count / c.total;
      const sb = bn / base.total;
      if (!best || Math.abs(sc - sb) > Math.abs(best.sc - best.sb)) best = { name, sc, sb };
    }
    if (best) {
      out.push(
        inferential(
          "corridor-cat",
          best.sc,
          best.sb,
          c.total,
          base.total,
          (rel) =>
            best!.sc > best!.sb
              ? `Здесь заметно чаще происходит «${lowerFirst(best!.name)}» — в ${dec(1 + rel)} раза выше среднего по стране.`
              : `Здесь реже обычного происходит «${lowerFirst(best!.name)}»: ${pct(best!.sc)} против ${pct(best!.sb)}.`,
          [
            ["На маршруте", pct(best.sc)],
            ["По стране", pct(best.sb)],
          ],
          best.sc > best.sb,
        ),
      );
    }
  }

  // --- погода ---
  {
    const baseByW = new Map(base.weathers);
    let best: { name: string; sc: number; sb: number } | null = null;
    for (const [name, count] of c.topWeathers.slice(0, 5)) {
      const bn = baseByW.get(name);
      if (!bn) continue;
      const sc = count / c.total;
      const sb = bn / base.total;
      if (!best || Math.abs(sc - sb) > Math.abs(best.sc - best.sb)) best = { name, sc, sb };
    }
    if (best && best.sc > best.sb) {
      out.push(
        inferential(
          "corridor-weather",
          best.sc,
          best.sb,
          c.total,
          base.total,
          (rel) =>
            `Доля ДТП в погоду «${lowerFirst(best!.name)}» здесь в ${dec(1 + rel)} раза выше средней по стране.`,
          [
            ["На маршруте", pct(best.sc)],
            ["По стране", pct(best.sb)],
          ],
          true,
        ),
      );
    }
  }

  // --- час пика: описательная, со счётом ---
  {
    const worst = c.worstHours[0];
    if (worst && worst.c > 0) {
      out.push(
        descriptive(
          "corridor-hour",
          `Больше всего происшествий приходится на ${hh(worst.h)} — ${num(worst.c)} из ${num(c.total)} на маршруте.`,
          Math.max(0.2, worst.lift - 1),
          c.total,
          [
            [`Час ${hh(worst.h)}`, `${num(worst.c)} ДТП`],
            ["Отклонение от среднего часа", `×${dec(worst.lift, 2)}`],
          ],
        ),
      );
    }
  }

  /**
   * Для маршрута сортировка по магнитуде даёт неверный результат.
   *
   * На трассе «наезд на пешехода реже среднего» — самая большая разница
   * в цифрах, но для водителя это пустяк, а вынесенное вердиктом ещё и
   * вводит в заблуждение: человек читает первую строку как оценку риска.
   * При этом «съезд с дороги втрое выше среднего» проигрывает ей по
   * абсолютной дельте, хотя именно это ему и нужно знать.
   *
   * Поэтому порядок задаётся смыслом, а не размером эффекта.
   */
  const PRIORITY: Record<string, number> = {
    "corridor-death": 5,
    "corridor-severe": 4,
    "corridor-cat": 3,
    "corridor-weather": 2,
    "corridor-hour": 1,
  };
  /** Находка «здесь хуже среднего» важнее находки «здесь лучше»:
      вердикт должен предупреждать, а не успокаивать. */
  const w = (f: Finding) => (f.warns === false ? 0 : 1);
  return (out.filter(Boolean) as Finding[]).sort(
    (x, y) =>
      w(y) - w(x) ||
      (PRIORITY[y.id] ?? 0) - (PRIORITY[x.id] ?? 0) ||
      y.weight - x.weight,
  );
}
