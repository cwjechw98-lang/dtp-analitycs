"""Строим компактные JSON-агрегаты для дашборда из сырого geojson dtp-stat.

Использование:
    py build_aggregates.py
Вход:  ../data/raw/omskaia-oblast.geojson (+ download_meta.json)
Выход: ../web/public/data/*.json
"""
from __future__ import annotations

import json
import pathlib
import sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "web" / "public" / "data"

SEV_ORDER = ["Легкий", "Тяжёлый", "С погибшими"]
SEASONS = ["Зима", "Весна", "Лето", "Осень"]
TODS = ["Ночь", "Утро", "День", "Вечер"]
WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

EXP_BUCKETS = ["0–2", "3–5", "6–10", "11–15", "16–20", "21+"]


def exp_bucket_idx(years: float | None) -> int:
    if years is None:
        return -1
    if years <= 2:
        return 0
    if years <= 5:
        return 1
    if years <= 10:
        return 2
    if years <= 15:
        return 3
    if years <= 20:
        return 4
    return 5


def tod_idx(hour: int) -> int:
    if hour >= 23 or hour < 6:
        return 0  # ночь
    if hour < 12:
        return 1  # утро
    if hour < 18:
        return 2  # день
    return 3  # вечер


def season_idx(month: int) -> int:
    if month in (12, 1, 2):
        return 0
    if month in (3, 4, 5):
        return 1
    if month in (6, 7, 8):
        return 2
    return 3


def norm_sev(s: str | None) -> int:
    if not s:
        return 0
    t = s.replace("ё", "е").lower()
    if "гиб" in t or "погиб" in t:
        return 2
    if "тяж" in t:
        return 1
    return 0


def clean_model(m: str | None) -> str | None:
    if not m:
        return None
    return m.replace(" и модификации", "").strip()


# Приблизительные границы Омской области с запасом (отсекаем мусорные координаты).
BBOX = {"lat_min": 53.2, "lat_max": 58.8, "lon_min": 70.5, "lon_max": 76.6}


def main() -> int:
    import datetime as dt

    src = RAW_DIR / "omskaia-oblast.geojson"
    if not src.exists():
        print(f"ОШИБКА: нет {src}, запусти download.py", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Читаем сырые данные...")
    with open(src, encoding="utf-8") as fh:
        data = json.load(fh)
    feats = data.get("features") or []
    print(f"Фич: {len(feats)}")

    # ---- счётчики ----
    by_year_acc = Counter(); by_year_dead = Counter(); by_year_inj = Counter()
    sev_tot = Counter()
    cat_cnt = Counter()
    light_cnt = Counter()
    weather_cnt = Counter()
    road_cnt = Counter()

    hour_weekday = [[0] * 24 for _ in range(7)]
    by_hour = [0] * 24
    hour_sev = [[0] * 3 for _ in range(24)]
    by_month = [0] * 12
    month_year: dict[int, Counter] = defaultdict(Counter)
    season_cnt = Counter()
    tod_sev = [[0] * 3 for _ in range(4)]

    brand_cnt = Counter()
    model_cnt = Counter()
    veh_cat_cnt = Counter()
    age_buckets = Counter()
    AGE_LABELS = ["0–3", "4–7", "8–12", "13+"]
    brand_sev: dict[str, Counter] = defaultdict(Counter)
    brand_total = Counter()

    exp_stats = [{"drivers": 0, "accidents": set(), "severe": 0,
                  "night": 0, "inj": 0} for _ in EXP_BUCKETS]
    exp_season = [[0] * 4 for _ in range(len(EXP_BUCKETS))]
    exp_tod = [[0] * 4 for _ in range(len(EXP_BUCKETS))]

    # словари для points.json
    cats: dict[str, int] = {}
    sevs = SEV_ORDER[:]
    lights: dict[str, int] = {}
    weathers: dict[str, int] = {}
    roads: dict[str, int] = {}
    brands: dict[str, int] = {}

    def idx(d: dict[str, int], k: str | None) -> int:
        if not k:
            return -1
        if k not in d:
            d[k] = len(d)
        return d[k]

    rows: list[list[int]] = []
    skipped = 0
    date_min, date_max = None, None

    for feat in feats:
        p = feat.get("properties") or {}
        pt = p.get("point") or {}
        try:
            lat = round(float(pt["lat"]), 5)
            lon = round(float(pt["long"]), 5)
        except (KeyError, TypeError, ValueError):
            skipped += 1
            continue
        if not (BBOX["lat_min"] <= lat <= BBOX["lat_max"] and
                BBOX["lon_min"] <= lon <= BBOX["lon_max"]):
            skipped += 1
            continue

        ds = p.get("datetime") or ""
        try:
            year = int(ds[0:4]); month = int(ds[5:7]); day = int(ds[8:10])
            hour = int(ds[11:13])
        except (ValueError, TypeError):
            skipped += 1
            continue
        if not (2000 <= year <= 2100):
            skipped += 1
            continue
        d0 = dt.date(year, month, day)
        dow = d0.weekday()
        ym = year * 100 + month

        if date_min is None or ds[:10] < date_min:
            date_min = ds[:10]
        if date_max is None or ds[:10] > date_max:
            date_max = ds[:10]

        dead = int(p.get("dead_count") or 0)
        inj = int(p.get("injured_count") or 0)
        sidx = norm_sev(p.get("severity"))

        # --- агрегаты ---
        by_year_acc[year] += 1; by_year_dead[year] += dead; by_year_inj[year] += inj
        sev_tot[sidx] += 1
        cat_cnt[p.get("category") or "Не указано"] += 1
        light = (p.get("light") or "").strip() or "Не указано"
        light_cnt[light] += 1
        wl = p.get("weather") or []
        wname = (wl[0] if wl else "") .strip() or "Не указано"
        weather_cnt[wname] += 1
        rc = p.get("road_conditions") or []
        rname = (rc[0] if rc else "").strip() or "Не указано"
        road_cnt[rname] += 1

        hour_weekday[dow][hour] += 1
        by_hour[hour] += 1
        hour_sev[hour][sidx] += 1
        by_month[month - 1] += 1
        month_year[year][month - 1] += 1
        sind = season_idx(month)
        season_cnt[SEASONS[sind]] += 1
        tind = tod_idx(hour)
        tod_sev[tind][sidx] += 1

        # --- транспорт ---
        vehs = p.get("vehicles") or []
        first_brand = None
        for i, veh in enumerate(vehs):
            b = (veh.get("brand") or "").strip()
            m = clean_model(veh.get("model"))
            vc = (veh.get("category") or "").strip()
            vy = veh.get("year")
            if b:
                brand_cnt[b] += 1
                brand_sev[b][sidx] += 1
                brand_total[b] += 1
                if i == 0:
                    first_brand = b
            if m:
                model_cnt[(b or "?") + "|" + m] += 1
            if vc:
                veh_cat_cnt[vc] += 1
            if isinstance(vy, int) and 1950 <= vy <= year:
                age = year - vy
                bi = 0 if age <= 3 else 1 if age <= 7 else 2 if age <= 12 else 3
                age_buckets[AGE_LABELS[bi]] += 1
            for part in (veh.get("participants") or []):
                if part.get("role") == "Водитель":
                    ebi = exp_bucket_idx(part.get("years_of_driving_experience"))
                    if ebi >= 0:
                        st = exp_stats[ebi]
                        st["drivers"] += 1
                        st["accidents"].add(len(rows))
                        if sidx >= 1:
                            st["severe"] += 1
                        if tind == 0:
                            st["night"] += 1
                        st["inj"] += inj
                        exp_season[ebi][sind] += 1
                        exp_tod[ebi][tind] += 1

        rows.append([
            lat, lon, ym, dow, hour, sidx,
            idx(cats, p.get("category")),
            idx(lights, light),
            idx(weathers, wname),
            idx(roads, rname),
            max((exp_bucket_idx(part.get("years_of_driving_experience"))
                 for veh in vehs for part in (veh.get("participants") or [])
                 if part.get("role") == "Водитель"), default=-1),
            idx(brands, first_brand),
            dead, inj,
        ])

    years_sorted = sorted(by_year_acc)

    def dump(name: str, obj) -> None:
        path = OUT_DIR / name
        text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        path.write_text(text, encoding="utf-8")
        print(f"  {name}: {path.stat().st_size / 1e6:.2f} МБ")

    total = sum(by_year_acc.values())
    print(f"Итого в выборке: {total}, пропущено записей: {skipped}")

    dl_meta_path = RAW_DIR / "download_meta.json"
    dl_meta = json.loads(dl_meta_path.read_text(encoding="utf-8")) if dl_meta_path.exists() else {}

    dump("meta.json", {
        "schema_version": 1,
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_url": dl_meta.get("source_url"),
        "opendata_page": dl_meta.get("opendata_page"),
        "region": "Омская область",
        "total_accidents": total,
        "skipped_records": skipped,
        "date_min": date_min,
        "date_max": date_max,
        "bbox": BBOX,
        "counts_by_year": {str(y): by_year_acc[y] for y in years_sorted},
        "totals": {
            "dead": sum(by_year_dead.values()),
            "injured": sum(by_year_inj.values()),
        },
    })

    dump("overview.json", {
        "by_year": [
            {"year": y, "accidents": by_year_acc[y],
             "dead": by_year_dead[y], "injured": by_year_inj[y]}
            for y in years_sorted
        ],
        "severity_totals": [sev_tot[i] for i in range(3)],
        "categories": cat_cnt.most_common(),
        "lights": light_cnt.most_common(),
        "weathers": weather_cnt.most_common(),
        "roads": road_cnt.most_common(),
    })

    dump("temporal.json", {
        "weekdays": WEEKDAYS,
        "tods": TODS,
        "seasons": SEASONS,
        "hour_weekday": hour_weekday,
        "by_hour": by_hour,
        "hour_severity": hour_sev,
        "by_month": by_month,
        "years": years_sorted,
        "month_year": [[month_year[y][m] for m in range(12)] for y in years_sorted],
        "season_counts": {s: season_cnt[s] for s in SEASONS},
        "tod_severity": tod_sev,
    })

    top_brands = [
        {"name": b, "count": c,
         "severe_share": round((brand_sev[b][1] + brand_sev[b][2]) / c, 3)}
        for b, c in brand_cnt.most_common(25)
    ]
    top_models = [
        {"brand": bm.split("|", 1)[0], "model": bm.split("|", 1)[1], "count": c}
        for bm, c in model_cnt.most_common(30)
    ]
    dump("vehicles.json", {
        "top_brands": top_brands,
        "top_models": top_models,
        "vehicle_categories": veh_cat_cnt.most_common(15),
        "age_labels": AGE_LABELS,
        "age_counts": [age_buckets.get(a, 0) for a in AGE_LABELS],
    })

    base_severe = (sev_tot[1] + sev_tot[2]) / total if total else 0
    dump("experience.json", {
        "buckets": EXP_BUCKETS,
        "baseline_severe_share": round(base_severe, 3),
        "stats": [
            {
                "bucket": EXP_BUCKETS[i],
                "drivers": st["drivers"],
                "accidents": len(st["accidents"]),
                "severe_share": round(st["severe"] / len(st["accidents"]), 3) if st["accidents"] else 0,
                "night_share": round(st["night"] / len(st["accidents"]), 3) if st["accidents"] else 0,
                "avg_injured": round(st["inj"] / len(st["accidents"]), 2) if st["accidents"] else 0,
            } for i, st in enumerate(exp_stats)
        ],
        "bucket_season": exp_season,
        "bucket_tod": exp_tod,
    })

    dump("points.json", {
        "dicts": {
            "cats": list(cats.keys()),
            "sevs": sevs,
            "lights": list(lights.keys()),
            "weathers": list(weathers.keys()),
            "roads": list(roads.keys()),
            "brands": list(brands.keys()),
        },
        "rows": rows,
    })

    print("Готово.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
