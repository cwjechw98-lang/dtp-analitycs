"""Генерация базы советов tips.json: правила из относительных рисков агрегированных данных.

Правило публикуется только если выборка достаточно велика (n >= MIN_N)
и условный риск отличается от базового не меньше чем на LIFT_MIN.

Использование:
    py build_recommendations.py
Выход: ../web/public/data/tips.json
"""
from __future__ import annotations

import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "web" / "public" / "data"

MIN_N_FREQ = 400      # минимум наблюдений для правил частоты
MIN_N_SEV = 250       # минимум для правил тяжести
LIFT_MIN_FREQ = 1.20  # порог превышения базовой частоты
LIFT_MIN_SEV = 1.20   # порог превышения базовой доли тяжёлых

TODS = ["Ночь", "Утро", "День", "Вечер"]
SEASONS = ["Зима", "Весна", "Лето", "Осень"]


def tod_idx(hour: int) -> int:
    if hour >= 23 or hour < 6:
        return 0
    if hour < 12:
        return 1
    if hour < 18:
        return 2
    return 3


def season_idx(ym: int) -> int:
    m = ym % 100
    return 0 if m in (12, 1, 2) else 1 if m in (3, 4, 5) else 2 if m in (6, 7, 8) else 3


def pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def main() -> int:
    import datetime as dt

    points = json.loads((DATA_DIR / "points.json").read_text(encoding="utf-8"))
    dicts = points["dicts"]
    rows = points["rows"]
    n_total = len(rows)
    if not n_total:
        print("ОШИБКА: пустой points.json — сначала запусти build_aggregates.py", file=sys.stderr)
        return 1

    # индексы колонок
    I_YM, I_DOW, I_HOUR, I_SEV = 2, 3, 4, 5
    I_CAT, I_LIGHT, I_WEA, I_ROAD, I_EXP, I_BRAND = 6, 7, 8, 9, 10, 11
    I_DEAD, I_INJ = 12, 13

    severe_total = sum(1 for r in rows if r[I_SEV] >= 1)
    base_sev = severe_total / n_total

    rules: list[dict] = []

    def add(rule_id, scope, when, lift, n, title, text, tags):
        rules.append({"id": rule_id, "scope": scope, "when": when,
                      "lift": round(lift, 2), "n": n,
                      "title": title, "text": text, "tags": tags})

    # ---------- 1. Частота по времени суток ----------
    tod_cnt = Counter(tod_idx(r[I_HOUR]) for r in rows)
    for t in range(4):
        n = tod_cnt[t]
        lift = n / (n_total / 4)
        if n >= MIN_N_FREQ and lift >= LIFT_MIN_FREQ:
            add(f"freq-tod-{t}", "time", {"tod": TODS[t]}, lift, n,
                f"{TODS[t]} — повышенный поток ДТП",
                f"На период {TODS[t].lower()} приходится {pct(n / n_total)} всех ДТП "
                f"(ожидалось бы 25%). Если есть выбор — планируй выезд вне этого окна.",
                ["время"])
        elif n >= MIN_N_FREQ and lift <= 1 / LIFT_MIN_FREQ:
            add(f"quiet-tod-{t}", "time", {"tod": TODS[t]}, lift, n,
                f"{TODS[t]} — статистически спокойное окно",
                f"Доля ДТП за {TODS[t].lower()} всего {pct(n / n_total)} — "
                f"это одно из самых безопасных окон суток.",
                ["время"])

    # ---------- 2. Пятничный вечер ----------
    fri_evening = sum(1 for r in rows if r[I_DOW] == 4 and 17 <= r[I_HOUR] <= 19)
    other_evening = sum(1 for r in rows if r[I_DOW] != 4 and r[I_DOW] <= 4 and 17 <= r[I_HOUR] <= 19)
    if fri_evening > 200 and other_evening > 200:
        per_weekday = other_evening / 4  # среднее по буднему дню (Пн–Чт), те же часы
        lift = fri_evening / per_weekday
        add("friday-evening", "time", {"weekday": "Пт", "hour_from": 17, "hour_to": 19},
            max(lift, 1 / lift), fri_evening,
            "Пятница 17:00–19:00",
            f"В пятничный вечерний пик аварий на {pct(abs(lift - 1))} "
            f"{'больше' if lift > 1 else 'меньше'}, чем в те же часы среднего буднего дня "
            f"(Пн–Чт). Планируй поздние пятничные поездки с запасом времени.",
            ["время", "пятница"])

    # ---------- 3. Сезон × время суток ----------
    combo = Counter((season_idx(r[I_YM]), tod_idx(r[I_HOUR])) for r in rows)
    for s in range(4):
        for t in range(4):
            n = combo[(s, t)]
            lift = n / (n_total / 16)
            if n >= MIN_N_FREQ and lift >= LIFT_MIN_FREQ:
                add(f"combo-{s}-{t}", "season_time", {"season": SEASONS[s], "tod": TODS[t]},
                    lift, n,
                    f"{SEASONS[s]}, {TODS[t].lower()}",
                    f"Комбинация «{SEASONS[s]} + {TODS[t].lower()}» даёт {pct(lift - 1)} к средней "
                    f"частоте аварий. Учитывай при планировании длинных поездок.",
                    ["сезон", "время"])

    # ---------- 4. Погода: тяжесть ----------
    wea_sev = Counter(); wea_n = Counter()
    for r in rows:
        wi = r[I_WEA]
        if wi < 0:
            continue
        wea_n[wi] += 1
        if r[I_SEV] >= 1:
            wea_sev[wi] += 1
    for wi, n in wea_n.most_common():
        name = dicts["weathers"][wi]
        if name == "Не указано" or n < MIN_N_SEV:
            continue
        rate = wea_sev[wi] / n
        ratio = rate / base_sev
        if ratio >= LIFT_MIN_SEV:
            add(f"wea-{wi}", "weather", {"weather": name}, ratio, n,
                f"«{name}»: аварии тяжелее",
                f"При погоде «{name}» доля тяжёлых ДТП и ДТП с погибшими — "
                f"{pct(rate)} против {pct(base_sev)} в среднем ({ratio:.1f}×). "
                f"Скорость ниже, дистанция больше.",
                ["погода", "тяжесть"])

    # ---------- 5. Освещение: тяжесть ----------
    light_sev = Counter(); light_n = Counter()
    for r in rows:
        li = r[I_LIGHT]
        if li < 0:
            continue
        light_n[li] += 1
        if r[I_SEV] >= 1:
            light_sev[li] += 1
    for li, n in light_n.most_common():
        name = dicts["lights"][li]
        if name == "Не указано" or n < MIN_N_SEV:
            continue
        rate = light_sev[li] / n
        ratio = rate / base_sev
        if ratio >= LIFT_MIN_SEV:
            add(f"light-{li}", "light", {"light": name}, ratio, n,
                f"«{name}»: риск тяжелее",
                f"При освещении «{name}» доля тяжёлых последствий {pct(rate)} "
                f"({ratio:.1f}× к среднему). Планируй тёмные участки маршрута на светлое время.",
                ["освещение", "тяжесть"])

    # ---------- 6. Стаж водителей ----------
    exp_data = json.loads((DATA_DIR / "experience.json").read_text(encoding="utf-8"))
    exp_texts = {
        "0–2": ("Стаж до 3 лет", "Новички чаще остальных попадают в лёгкие столкновения: "
                                 "держи дистанцию, не торопись перестраиваться."),
        "3–5": ("Стаж 3–5 лет", "Ранний опыт часто сопровождается самоуверенностью: "
                                "статистика показывает повышенную аварийность."),
        "6–10": ("Стаж 6–10 лет", "Средний стаж — самая многочисленная группа водителей: "
                                  "следи за усталостью в длинных поездках."),
        "11–15": ("Стаж 11–15 лет", "Опытные водители реже ошибаются в простых ситуациях, "
                                    "но чаще недооценивают сложные условия."),
        "16–20": ("Стаж 16–20 лет", "Большой стаж снижает риск, но привычка к «уверенной» езде "
                                    "опасна именно в плохую погоду."),
        "21+": ("Стаж более 20 лет", "Максимальный стаж: главные риски — рутина и "
                                     "недооценка изменившихся условий дороги."),
    }
    baseline = exp_data["baseline_severe_share"]
    for st in exp_data["stats"]:
        b = st["bucket"]
        if st["accidents"] < MIN_N_SEV:
            continue
        ratio = st["severe_share"] / baseline if baseline else 0
        direction = ("выше" if ratio > 1.08 else "ниже" if ratio < 0.92 else "на уровне")
        title, hint = exp_texts.get(b, (b, ""))
        add(f"exp-{b}", "experience", {"experience_bucket": b}, max(ratio, 1 / ratio if ratio else 9),
            st["accidents"],
            f"{title}: тяжесть ДТП {direction} средней",
            f"У водителей с бакетом стажа «{b}» доля тяжёлых исходов {st['severe_share'] * 100:.0f}% "
            f"(в среднем {baseline * 100:.0f}%). {hint}",
            ["стаж"])

    # ---------- 7. Дорога ----------
    road_sev = Counter(); road_n = Counter()
    for r in rows:
        ri = r[I_ROAD]
        if ri < 0:
            continue
        road_n[ri] += 1
        if r[I_SEV] >= 1:
            road_sev[ri] += 1
    for ri, n in road_n.most_common():
        name = dicts["roads"][ri]
        if name == "Не указано" or n < MIN_N_SEV:
            continue
        rate = road_sev[ri] / n
        ratio = rate / base_sev
        if ratio >= LIFT_MIN_SEV:
            add(f"road-{ri}", "road", {"road_condition": name}, ratio, n,
                f"Покрытие «{name}»",
                f"На покрытии «{name}» доля тяжёлых ДТП {pct(rate)} ({ratio:.1f}× к среднему). "
                f"Заранее проверяй прогноз и состояние трассы.",
                ["дорога", "тяжесть"])

    out = {
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "baseline": {
            "severe_share": round(base_sev, 3),
            "accidents_total": n_total,
        },
        "thresholds": {"min_n": [MIN_N_FREQ, MIN_N_SEV], "lift_min": LIFT_MIN_FREQ},
        "rules": rules,
    }
    path = DATA_DIR / "tips.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"tips.json: {len(rules)} правил, {path.stat().st_size / 1024:.0f} КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
