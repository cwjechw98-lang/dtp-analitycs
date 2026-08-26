"""Валидация схемы выгрузки dtp-stat: падаем громко, если источник изменился.

Использование:
    py validate.py
"""
from __future__ import annotations

import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW_GEOJSON = ROOT / "data" / "raw" / "omskaia-oblast.geojson"

# Поля, без которых пайплайн не может работать.
REQUIRED_FEATURE_KEYS = ["id", "datetime", "category", "severity", "point"]
# Поля, нужные ключевым разделам дашборда; их отсутствие — предупреждение.
EXPECTED_KEYS = [
    "light", "weather", "road_conditions", "vehicles",
    "dead_count", "injured_count", "participants_count", "region",
]
DRIVER_EXPERIENCE_KEY = "years_of_driving_experience"


def main() -> int:
    if not RAW_GEOJSON.exists():
        print(f"ОШИБКА: не найден {RAW_GEOJSON}. Сначала запусти download.py", file=sys.stderr)
        return 1

    print(f"Читаем {RAW_GEOJSON.name} ...")
    with open(RAW_GEOJSON, encoding="utf-8") as fh:
        data = json.load(fh)

    features = data.get("features") or []
    if not features:
        print("ОШИБКА: пустой FeatureCollection", file=sys.stderr)
        return 1

    missing_required = Counter()
    missing_expected = Counter()
    has_experience = 0
    drivers_total = 0
    dates = []
    ids_seen = set()
    duplicated_ids = 0

    for feat in features:
        props = feat.get("properties") or {}
        for key in REQUIRED_FEATURE_KEYS:
            v = props.get(key)
            if key == "point":
                if not isinstance(v, dict) or not v.get("lat") or not v.get("long"):
                    missing_required[key] += 1
            elif v is None or v == "":
                missing_required[key] += 1
        for key in EXPECTED_KEYS:
            if key not in props:
                missing_expected[key] += 1

        fid = props.get("id")
        if fid is not None:
            if fid in ids_seen:
                duplicated_ids += 1
            ids_seen.add(fid)

        for veh in (props.get("vehicles") or []):
            for part in (veh.get("participants") or []):
                if part.get("role") == "Водитель":
                    drivers_total += 1
                    if part.get(DRIVER_EXPERIENCE_KEY) is not None:
                        has_experience += 1

        dt_str = props.get("datetime")
        if dt_str:
            dates.append(dt_str[:10])

    n = len(features)
    print(f"Всего ДТП: {n}")
    if dates:
        print(f"Период данных: {min(dates)} … {max(dates)}")
    print(f"Дубликатов id: {duplicated_ids}")
    print(f"Водителей в выборке ТС: {drivers_total}, со стажем: {has_experience} "
          f"({(has_experience / drivers_total * 100) if drivers_total else 0:.0f}%)")

    ok = True
    for key, cnt in missing_required.items():
        pct = cnt / n * 100
        level = "ОШИБКА" if pct > 5 else "warn"
        print(f"[{level}] обязательное поле '{key}' отсутствует у {cnt} ({pct:.2f}%)")
        if pct > 5:
            ok = False
    for key, cnt in missing_expected.items():
        print(f"[warn] поле '{key}' отсутствует у {cnt} ({cnt / n * 100:.2f}%)")

    if not ok:
        print("Схема источника существенно изменилась — обнови build_aggregates.py",
              file=sys.stderr)
        return 1
    print("Валидация пройдена.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
