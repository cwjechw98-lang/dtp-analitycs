"""Phase 0 — инвентаризация исходных данных ДТП (аудит без изменения продукта).

Проходит ВСЕ регионы из data/raw/*.geojson (ijson-стриминг), собирает:
  - покрытие каждого поля properties + вложенных (vehicles, participants)
  - типы, unique, top-100 для категориальных
  - отдельно ТС (бренд/модель/категория/год/цвет) и участников (роль/пол/здоровье/стаж/нарушения)
  - временное покрытие 2015-2026, региональное покрытие и аномалии

Пишет машинно-читаемый JSON в docs/data-inventory-v4.json (для сравнения после
изменения pipeline). НЕ меняет продукт и pipeline.
"""
from __future__ import annotations

import collections
import datetime as dt
import json
import pathlib
import statistics

import ijson

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DOCS = ROOT / "docs"

TOP_N = 100          # сколько значений держать в top-категориях
REGION_TOP = 100     # сколько регионов показывать в региональной таблице

# поля верхнего уровня, которые анализируем показ-кой
# (point/datetime/участники/vehicles разбираются отдельно)
SCALAR_PROP_FIELDS = [
    "id", "tags", "light", "region", "scheme", "address", "weather", "category",
    "datetime", "severity", "dead_count", "gibdd_number", "injured_count",
    "parent_region", "road_conditions", "participants_count", "participant_categories",
    "nearby",
]

# поля-списки, чьё СОДЕРЖИМОЕ важно (считаем элементы, а не длину массива)
# -> FieldStat по имени элемента
LIST_CONTENT_FIELDS = {
    "nearby": "nearby_elem",            # объекты УДС рядом
    "weather": "weather_elem",          # погода
    "road_conditions": "road_elem",     # состояние дороги
    "participant_categories": "part_cat_elem",  # категории участников
    "tags": "tags_elem",                # теги
}

VEH_FIELDS = ["year", "brand", "color", "model", "category"]
PART_FIELDS = ["role", "gender", "health_status", "years_of_driving_experience", "violations"]

# Допустимые диапазоны для санитарного фильтра (не считаем покрытием мусор)
ALLOWED_LAT = (40.0, 84.0)
ALLOWED_LON = (-170.0, 180.0)
ALLOWED_YEAR = (2009, 2100)


class FieldStat:
    def __init__(self, name, level):
        self.name = name
        self.level = level
        self.total = 0
        self.missing = 0
        self.null = 0
        self.types = collections.Counter()
        self.values = collections.Counter()
        self.numeric_sum = 0.0
        self.numeric_sq = 0.0
        self.numeric_count = 0
        self.example = None

    def feed(self, v):
        self.total += 1
        if v is None:
            self.null += 1
            self.missing += 1
            return
        if isinstance(v, list):
            if not v:
                self.missing += 1
                return
            self.types["list"] += 1
            self.values["<list:%d>" % len(v)] += 1
            # первые элементы как примеры
            self._add_example(v[0] if isinstance(v[0], (str, int, float)) else str(v[:2]))
            return
        if isinstance(v, str):
            s = v.strip()
            if not s:
                self.missing += 1
                return
            self.types["str"] += 1
            self.values[s] += 1
            self._add_example(s)
            return
        if isinstance(v, bool):
            self.types["bool"] += 1
            self.values[str(v)] += 1
            self._add_example(bool(v))
            return
        if isinstance(v, (int, float)):
            self.types["num"] += 1
            self.numeric_sum += v
            self.numeric_sq += v * v
            self.numeric_count += 1
            # для интов держим гистограмму значений
            if isinstance(v, int):
                self.values[str(v)] += 1
            else:
                self.values[round(v, 2)] += 1
            self._add_example(v)
            return
        self.types[type(v).__name__] += 1
        self._add_example(repr(v))

    def _add_example(self, e):
        if self.example is None:
            self.example = e

    def summarize(self):
        missing = self.missing
        filled = self.total - missing
        d = {
            "field": self.name,
            "level": self.level,
            "total": self.total,
            "filled": filled,
            "filled_pct": round(filled / self.total, 4) if self.total else 0,
            "missing": missing,
            "missing_pct": round(missing / self.total, 4) if self.total else 0,
            "types": dict(self.types.most_common()),
            "unique": len(self.values),
            "example": self.example,
        }
        if self.numeric_count:
            mean = self.numeric_sum / self.numeric_count
            var = max(0.0, self.numeric_sq / self.numeric_count - mean * mean)
            d["numeric"] = {"mean": round(mean, 3), "stdev": round(var ** 0.5, 3), "n": self.numeric_count}
        return d

    def top(self, n=None):
        return self.values.most_common(n or TOP_N)


def iter_features(path):
    # ijson стриминг features.item
    with open(path, "rb") as fh:
        yield from ijson.items(fh, "features.item")


def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    files = sorted(RAW.glob("*.geojson"))
    files = [f for f in files if f.stat().st_size > 200_000]  # скипаем пустые/мусор
    print(f"Регионов для аудита: {len(files)}", flush=True)

    # --- аккумуляторы ---
    scalar = {f: FieldStat(f, "ДТП") for f in SCALAR_PROP_FIELDS}
    scalar["weather"].kind = "list_first"
    scalar["road_conditions"].kind = "list_first"
    scalar["nearby"].kind = "list_all"
    scalar["tags"].kind = "list_all"
    scalar["participant_categories"].kind = "list_all"
    scalar["point"] = FieldStat("point", "ДТП")
    point_ok = 0
    point_missing = 0

    # аккумуляторы содержимого list-полей (элементы, а не длина массива)
    list_content = {orig: FieldStat(field, "ДТП")
                    for field, orig in [(v, k) for k, v in LIST_CONTENT_FIELDS.items()]}
    # обратная: original-props-field -> fieldstat
    list_content_by_prop = {orig: stat for orig, stat in
                            zip(LIST_CONTENT_FIELDS.values(), list_content.values())}
    # проще: оригинальный props-ключ -> FieldStat
    list_content = {}
    for props_field, stat_name in LIST_CONTENT_FIELDS.items():
        list_content[props_field] = FieldStat(stat_name, "ДТП")

    veh = {f: FieldStat(f, "ТС") for f in VEH_FIELDS}
    part = {f: FieldStat(f, "участник") for f in PART_FIELDS}

    # --- аномалии марка/модель ---
    model_by_brand_mismatch = collections.Counter()  # (brand, model-from-other-brand)
    brand_in_model = collections.Counter()
    # бренд = марка, встречающаяся в модели другого бренда — детектим на лету по экзотике
    brand_values = collections.Counter()
    model_values = collections.Counter()
    brand_model_pairs = collections.Counter()
    brand_model_mismatch_examples = []

    cat_values = collections.Counter()
    color_values = collections.Counter()

    # --- временное/региональное покрытие ---
    by_year = collections.Counter()
    by_year_veh = collections.Counter()
    by_year_part = collections.Counter()
    by_year_dead = collections.Counter()
    by_year_inj = collections.Counter()
    by_year_missing_sev = collections.Counter()
    by_year_missing_light = collections.Counter()
    by_year_missing_addr = collections.Counter()
    by_year_missing_model = collections.Counter()
    by_year_missing_brand = collections.Counter()
    region_file = {}
    region_field_missing = {}   # region -> field -> missing fraction

    # глобальные счётчики
    total_feats = 0
    total_veh = 0
    total_part_veh = 0   # участники внутри ТС
    total_part_standalone = 0  # участники вне ТС (пешеходы)

    # количество вложенности
    veh_per_acc = []
    standalone_part = []

    start = dt.datetime.now(dt.timezone.utc)

    for fi, f in enumerate(files, 1):
        slug = f.stem
        t0 = dt.datetime.now()
        reg_total = 0
        reg_sev_missing = 0
        reg_light_missing = 0
        reg_addr_missing = 0
        reg_model_missing = 0
        reg_brand_missing = 0
        reg_veh = 0

        try:
            for feat in iter_features(f):
                props = feat.get("properties") or {}
                # считаем общий total только на верхнем уровне
                # определим регион
                region = props.get("region") or props.get("parent_region") or slug
                total_feats += 1
                reg_total += 1

                # --- скалярные поля верхнего уровня ---
                for field in SCALAR_PROP_FIELDS:
                    st = scalar[field]
                    v = props.get(field)
                    st.feed(v)
                    if field == "severity" and (not v or not str(v).strip()):
                        reg_sev_missing += 1
                        by_year_missing_sev.update([])  # заполняется ниже по year
                    if field == "light" and (not v or not str(v).strip()):
                        reg_light_missing += 1
                    if field == "address" and (not v or not str(v).strip()):
                        reg_addr_missing += 1
                    # содержимое list-полей (элементы по отдельности)
                    if field in list_content and isinstance(v, list):
                        for el in v:
                            if el is not None and (not isinstance(el, str) or el.strip()):
                                list_content[field].feed(el)

                # point
                pt = props.get("point")
                coords_ok = False
                if pt:
                    try:
                        lat = float(pt.get("lat"))
                        lon = float(pt.get("long"))
                        if ALLOWED_LAT[0] <= lat <= ALLOWED_LAT[1] and ALLOWED_LON[0] <= lon <= ALLOWED_LON[1]:
                            coords_ok = True
                            point_ok += 1
                        else:
                            point_missing += 1
                    except (KeyError, TypeError, ValueError):
                        point_missing += 1
                        scalar["point"].feed(None)
                else:
                    point_missing += 1
                    scalar["point"].feed(None)
                if coords_ok:
                    scalar["point"].feed({"lat": round(lat, 5), "long": round(lon, 5)})

                # datetime -> year
                ds = props.get("datetime") or ""
                try:
                    year = int(ds[0:4])
                except (ValueError, TypeError, IndexError):
                    year = None
                if year and ALLOWED_YEAR[0] <= year <= ALLOWED_YEAR[1]:
                    by_year[year] += 1
                    by_year_dead[year] += int(props.get("dead_count") or 0)
                    by_year_inj[year] += int(props.get("injured_count") or 0)
                if year and not (props.get("severity") or "").strip():
                    by_year_missing_sev[year] += 1
                if year and not (props.get("light") or "").strip():
                    by_year_missing_light[year] += 1
                if year and not (props.get("address") or "").strip():
                    by_year_missing_addr[year] += 1

                # --- vehicles ---
                vehs = props.get("vehicles") or []
                veh_per_acc.append(len(vehs))
                reg_veh += len(vehs)
                total_veh += len(vehs)
                by_year_veh[year] += len(vehs) if year else 0

                for v in vehs:
                    if not isinstance(v, dict):
                        continue
                    for field in VEH_FIELDS:
                        veh[field].feed(v.get(field))
                    b = (v.get("brand") or "").strip()
                    m_raw = v.get("model")
                    m = (m_raw or "").replace(" и модификации", "").strip() if m_raw else ""
                    if b:
                        brand_values[b] += 1
                        by_year_missing_brand[year] += 0
                    else:
                        by_year_missing_brand[year] += 1
                        reg_brand_missing += 1
                    if not m:
                        reg_model_missing += 1
                        by_year_missing_model[year] += 1
                    else:
                        model_values[m] += 1
                        # аномалия: модель = "ВАЗ 2115" / "Lada ..." а бренд другой
                        if b:
                            brand_model_pairs[(b, m)] += 1
                            # детект: в модели упоминается известный бренд
                            # (накапливаем марки и смотрим как «чужую марку в модели» позже)
                            model_by_brand_mismatch[(b, m)] += 1
                    cat_values[v.get("category") or ""] += 1
                    color_values[v.get("color") or ""] += 1

                    # участники внутри ТС
                    parts = v.get("participants") or []
                    total_part_veh += len(parts)
                    by_year_part[year] += len(parts) if year else 0
                    for pp in parts:
                        if not isinstance(pp, dict):
                            continue
                        for field in PART_FIELDS:
                            val = pp.get(field)
                            part[field].feed(val)
                            if field == "violations" and isinstance(val, list):
                                # отдельный счётчик нарушений
                                for viol in val:
                                    if viol and viol != "Нет нарушений":
                                        part.setdefault("_viol_raw", FieldStat("violations_raw", "участник")).feed(viol)

                # --- участники вне ТС (пешеходы) ---
                standalone = props.get("participants") or []
                total_part_standalone += len(standalone)
                standalone_part.append(len(standalone))
                for pp in standalone:
                    if not isinstance(pp, dict):
                        continue
                    for field in PART_FIELDS:
                        part[field].feed(pp.get(field))
                    if pp.get("role") == "Пешеход":
                        part.setdefault("_ped", FieldStat("ped_flag", "участник")).feed(True)

            region_file[slug] = {
                "name": region,
                "accidents": reg_total,
                "vehicles": reg_veh,
                "file_mb": round(f.stat().st_size / 1e6, 2),
                "missing_sev": reg_sev_missing,
                "missing_light": reg_light_missing,
                "missing_addr": reg_addr_missing,
                "missing_brand": reg_brand_missing,
                "missing_model": reg_model_missing,
            }
            print(f"[{fi}/{len(files)}] {slug}: {reg_total} ДТП, {reg_veh} ТС "
                  f"({(dt.datetime.now()-t0).total_seconds():.1f} c)", flush=True)
        except Exception as e:  # noqa: BLE001
            region_file[slug] = {"name": region, "accidents": -1, "error": str(e)[:120]}
            print(f"[{fi}/{len(files)}] {slug}: ОШИБКА {e}", flush=True)

    # --- финализация аномалий бренд/модель ---
    # бренд/модель пары уже собраны; конкретные примеры «чужой марки в модели»
    # будут визуально проверены вручную по top-pairs в отчёте.
    elapsed = (dt.datetime.now(dt.timezone.utc) - start).total_seconds()

    # --- сборка JSON ---
    inv = {
        "meta": {
            "generated_at_utc": start.isoformat(),
            "elapsed_sec": round(elapsed, 1),
            "regions_audited": len(region_file),
            "total_accidents": total_feats,
            "total_vehicles": total_veh,
            "total_participants_in_vehicles": total_part_veh,
            "total_participants_standalone": total_part_standalone,
            "raw_total_mb": round(sum(f.stat().st_size for f in files) / 1e6, 1),
            "top_n": TOP_N,
        },
        "coverage": {
            "point_ok": point_ok,
            "point_missing": point_missing,
        },
        "fields_scalar": {f: scalar[f].summarize() for f in scalar},
        "fields_vehicle": {f: veh[f].summarize() for f in veh},
        "fields_participant": {f: part[f].summarize() for f in part if not f.startswith("_")},
        "fields_list_content": {k: list_content[k].summarize() for k in list_content},
        "violations_raw": part["_viol_raw"].summarize() if "_viol_raw" in part else None,
        "top_scalar": {f: scalar[f].top() for f in ["light", "weather", "category", "severity",
                                                     "road_conditions", "participant_categories", "tags"]},
        "top_region": scalar["region"].top(20),
        "top_list_content": {k: list_content[k].top(30) for k in ["nearby", "weather", "road_conditions",
                                                                  "participant_categories", "tags"]},
        "top_vehicle": {f: veh[f].top() for f in ["brand", "model", "category", "color", "year"]},
        "top_participant": {f: part[f].top() for f in ["role", "gender", "health_status",
                                                       "years_of_driving_experience"]},
        "vehicle_per_acc": {"mean": round(statistics.mean(veh_per_acc), 3),
                            "max": max(veh_per_acc),
                            "hist": collections.Counter(veh_per_acc).most_common(10)},
        "standalone_participants": {"mean": round(statistics.mean(standalone_part), 4),
                                    "hist": collections.Counter(standalone_part).most_common(8)},
        "brand_top": brand_values.most_common(120),
        "model_top": model_values.most_common(120),
        "brand_model_top_pairs": [{"brand": b, "model": m, "count": c}
                                  for (b, m), c in brand_model_pairs.most_common(200)],
        "category_top": cat_values.most_common(60),
        "color_top": color_values.most_common(30),
        "temporal": {
            "by_year": {str(y): {
                "accidents": by_year[y],
                "vehicles": by_year_veh[y],
                "participants": by_year_part[y],
                "dead": by_year_dead[y],
                "injured": by_year_inj[y],
                "missing_severity": by_year_missing_sev[y],
                "missing_light": by_year_missing_light[y],
                "missing_address": by_year_missing_addr[y],
                "missing_brand": by_year_missing_brand[y],
                "missing_model": by_year_missing_model[y],
            } for y in sorted(set(list(by_year.keys()) + list(by_year_missing_sev.keys())))},
        },
        "regions": region_file,
    }

    out = DOCS / "data-inventory-v4.json"
    out.write_text(json.dumps(inv, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nJSON написан: {out} ({out.stat().st_size/1e6:.1f} МБ)", flush=True)
    print(f"ИТОГ: {total_feats} ДТП, {total_veh} ТС, {total_part_veh} участник(ов в ТС), "
          f"{total_part_standalone} одиночных, {elapsed:.1f} c", flush=True)
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
