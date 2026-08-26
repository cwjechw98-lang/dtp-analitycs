"""Сборка всех датасетов дашборда из выгрузок ВСЕХ регионов dtp-stat.

Использование:
    py build_all.py [--only slug1,slug2]
Вход:  ../data/raw/<slug>.geojson (+ manifest.json от download_all.py)
Выход: ../web/public/data/
    meta.json           — метаданные страны + список регионов
    dictionaries.json   — общие словари категорий/погоды/марок…
    national.json       — агрегаты по стране (обзор, время, авто, стаж, виновники)
    heat_cells.json     — геохэш-ячейки для глобальной карты
    tips.json           — база советов
    regions/<slug>.json — компактные точки региона для карты/маршрута

Строка points v2 (16 значений):
    [lat5, lon5, ym, dow, hour, sevIdx, catIdx, lightIdx, weatherIdx,
     roadIdx, expBucketIdx, firstVehBrandIdx, dead, injured,
     culpritBrandIdx(-1 нет ТС / -2 виновник не за рулём / иначе индекс марки),
     vehCount]
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data"

SEV_ORDER = ["Легкий", "Тяжёлый", "С погибшими"]
SEASONS = ["Зима", "Весна", "Лето", "Осень"]
TODS = ["Ночь", "Утро", "День", "Вечер"]
WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
EXP_BUCKETS = ["0–2", "3–5", "6–10", "11–15", "16–20", "21+"]
AGE_LABELS = ["0–3", "4–7", "8–12", "13+"]
GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


# ---------------------------------------------------------------- утилиты
def exp_bucket_idx(years) -> int:
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
        return 0
    if hour < 12:
        return 1
    if hour < 18:
        return 2
    return 3


def season_idx(ym: int) -> int:
    m = ym % 100
    return 0 if m in (12, 1, 2) else 1 if m in (3, 4, 5) else 2 if m in (6, 7, 8) else 3


def norm_sev(s) -> int:
    t = (s or "").replace("ё", "е").lower()
    if "гиб" in t or "погиб" in t:
        return 2
    if "тяж" in t:
        return 1
    return 0


def clean_model(m):
    return m.replace(" и модификации", "").strip() if m else None


def geohash5(lat: float, lon: float) -> str:
    """Классический geohash (base32) точности 5."""
    lat_lo, lat_hi = -90.0, 90.0
    lon_lo, lon_hi = -180.0, 180.0
    out = []
    bit = 0
    ch = 0
    even = True
    while len(out) < 5:
        if even:
            mid = (lon_lo + lon_hi) / 2
            if lon >= mid:
                ch |= 1 << (4 - bit)
                lon_lo = mid
            else:
                lon_hi = mid
        else:
            mid = (lat_lo + lat_hi) / 2
            if lat >= mid:
                ch |= 1 << (4 - bit)
                lat_lo = mid
            else:
                lat_hi = mid
        even = not even
        bit += 1
        if bit == 5:
            out.append(GEOHASH_BASE32[ch])
            bit = 0
            ch = 0
    return "".join(out)


def geohash_decode(h: str) -> tuple[float, float]:
    """Центр геохэш-ячейки (lat, lon)."""
    lat_lo, lat_hi = -90.0, 90.0
    lon_lo, lon_hi = -180.0, 180.0
    even = True
    for ch in h:
        cd = GEOHASH_BASE32.index(ch)
        for bitmask in (16, 8, 4, 2, 1):
            if even:
                mid = (lon_lo + lon_hi) / 2
                if cd & bitmask:
                    lon_lo = mid
                else:
                    lon_hi = mid
            else:
                mid = (lat_lo + lat_hi) / 2
                if cd & bitmask:
                    lat_lo = mid
                else:
                    lat_hi = mid
            even = not even
    return (lat_lo + lat_hi) / 2, (lon_lo + lon_hi) / 2


def iter_features(path: pathlib.Path):
    """Стриминг фич: ijson если доступен, иначе обычная загрузка."""
    try:
        import ijson  # type: ignore

        yield from ijson.items(open(path, "rb"), "features.item")
        return
    except ImportError:
        pass
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    yield from data.get("features") or []


def pct(x: float) -> str:
    return f"{x * 100:.0f}%"


class Idx(dict):
    """Словарь «значение -> индекс» с автодобавлением."""

    def idx(self, k):
        if k is None or k == "":
            return -1
        if k not in self:
            self[k] = len(self)
        return self[k]


# ------------------------------------------------------------- аккумуляторы
class Acc:
    def __init__(self):
        self.cats = Idx()
        self.lights = Idx()
        self.weathers = Idx()
        self.roads = Idx()
        self.brands = Idx()

        self.total = 0
        self.date_min = None
        self.date_max = None
        self.by_year_acc = collections.Counter()
        self.by_year_dead = collections.Counter()
        self.by_year_inj = collections.Counter()
        self.sev_tot = collections.Counter()
        self.cat_cnt = collections.Counter()
        self.light_cnt = collections.Counter()
        self.weather_cnt = collections.Counter()
        self.road_cnt = collections.Counter()

        self.hour_weekday = [[0] * 24 for _ in range(7)]
        self.by_hour = [0] * 24
        self.hour_sev = [[0] * 3 for _ in range(24)]
        self.by_month = [0] * 12
        self.month_year = collections.defaultdict(lambda: [0] * 12)
        self.season_cnt = collections.Counter()
        self.tod_sev = [[0] * 3 for _ in range(4)]

        self.brand_cnt = collections.Counter()
        self.brand_sev = collections.defaultdict(collections.Counter)
        self.model_cnt = collections.Counter()
        self.veh_cat_cnt = collections.Counter()
        self.age_buckets = collections.Counter()

        # стаж
        self.exp_drivers = collections.Counter()
        self.exp_acc_sets: list[set] = [set() for _ in EXP_BUCKETS]
        self.exp_severe = collections.Counter()
        self.exp_night = collections.Counter()
        self.exp_inj = collections.Counter()
        self.exp_season = [[0] * 4 for _ in EXP_BUCKETS]
        self.exp_tod = [[0] * 4 for _ in EXP_BUCKETS]

        # виновность
        self.violations_top = collections.Counter()
        # Детали по маркам для эксплорера автопрома
        self.brand_models_total = collections.defaultdict(collections.Counter)
        self.brand_models_culprit = collections.defaultdict(collections.Counter)
        self.brand_viol = collections.defaultdict(collections.Counter)
        self.culprit_by_brand = collections.Counter()   # марка виновника (по ТС)
        self.victim_by_brand = collections.Counter()    # марка «пострадавшего» ТС
        self.accidents_with_vehicle_culprit = 0
        self.pedestrian_culprit_accidents = 0

        # правила советов
        self.tod_cnt = collections.Counter()
        self.combo_season_tod = collections.Counter()
        self.wea_sev = collections.Counter()
        self.wea_n = collections.Counter()
        self.light_sev = collections.Counter()
        self.light_n = collections.Counter()
        self.road_sev = collections.Counter()
        self.road_n = collections.Counter()
        self.fri_evening = 0
        self.other_evening = 0

        self.heat_cells = collections.Counter()

    def feed(self, feat, rows_out: list) -> None:
        p = feat.get("properties") or {}
        pt = p.get("point") or {}
        try:
            lat = round(float(pt["lat"]), 5)
            lon = round(float(pt["long"]), 5)
        except (KeyError, TypeError, ValueError):
            return
        # Санитарный фильтр: только реалистичные координаты России.
        # Мусорные точки источника вроде (5, 1) ломали bbox региона и карту.
        if not (40 <= lat <= 84 and -170 <= lon <= 180):
            return

        ds = p.get("datetime") or ""
        try:
            year = int(ds[0:4]); month = int(ds[5:7]); day = int(ds[8:10])
            hour = int(ds[11:13])
        except (ValueError, TypeError, IndexError):
            return
        if not (2009 <= year <= 2100):
            return

        d0 = dt.date(year, month, day)
        dow = d0.weekday()
        ym = year * 100 + month
        sidx = norm_sev(p.get("severity"))
        dead = int(p.get("dead_count") or 0)
        inj = int(p.get("injured_count") or 0)
        tind = tod_idx(hour)
        sind = season_idx(ym)

        if self.date_min is None or ds[:10] < self.date_min:
            self.date_min = ds[:10]
        if self.date_max is None or ds[:10] > self.date_max:
            self.date_max = ds[:10]

        light = (p.get("light") or "").strip() or "Не указано"
        wl = p.get("weather") or []
        wname = (wl[0] if wl else "").strip() or "Не указано"
        rc = p.get("road_conditions") or []
        rname = (rc[0] if rc else "").strip() or "Не указано"

        li = self.lights.idx(light)
        wi = self.weathers.idx(wname)
        ri = self.roads.idx(rname)
        ci = self.cats.idx(p.get("category"))

        # --- временные агрегаты ---
        self.hour_weekday[dow][hour] += 1
        self.by_hour[hour] += 1
        self.hour_sev[hour][sidx] += 1
        self.by_month[month - 1] += 1
        self.month_year[year][month - 1] += 1
        self.season_cnt[SEASONS[sind]] += 1
        self.tod_sev[tind][sidx] += 1
        self.tod_cnt[tind] += 1
        self.combo_season_tod[(sind, tind)] += 1
        self.wea_n[wi] += 1
        if sidx >= 1:
            self.wea_sev[wi] += 1
        self.light_n[li] += 1
        if sidx >= 1:
            self.light_sev[li] += 1
        self.road_n[ri] += 1
        if sidx >= 1:
            self.road_sev[ri] += 1
        if dow == 4 and 17 <= hour <= 19:
            self.fri_evening += 1
        elif dow in (0, 1, 2, 3) and 17 <= hour <= 19:
            self.other_evening += 1

        cell = geohash5(lat, lon)
        self.heat_cells[cell] += 1
        self.heat_cells[cell + ":d"] += dead
        self.heat_cells[cell + ":i"] += inj
        self.heat_cells[cell + ":s" + str(sidx)] += 1

        # --- транспорт, участники, стаж, виновность ---
        vehs = p.get("vehicles") or []
        first_brand_raw = (vehs[0].get("brand") if vehs and isinstance(vehs[0], dict) else None)
        first_brand_idx = -1
        if first_brand_raw:
            first_brand_idx = self.brands.idx(first_brand_raw.strip())

        culprit_brand_idx = -2 if vehs else -1  # без ТС вообще → -1
        seen_culprit = False
        row_index = self.total
        for veh in vehs:
            b = ((veh.get("brand") or "") or "").strip()
            m = clean_model(veh.get("model"))
            vc = (veh.get("category") or "").strip()
            vy = veh.get("year")
            b_idx = self.brands.idx(b) if b else -1
            if b:
                self.brand_cnt[b] += 1
                self.brand_sev[b][sidx] += 1
            is_driver_violator = False
            driver_viols: list[str] = []
            for part in (veh.get("participants") or []):
                if part.get("role") != "Водитель":
                    continue
                # «Нет нарушений» — служебная запись источника для невиновных
                viols = [v for v in (part.get("violations") or []) if v and v != "Нет нарушений"]
                if viols:
                    self.violations_top.update(v for v in viols)
                    driver_viols.extend(viols)
                    is_driver_violator = True
                    ebi = exp_bucket_idx(part.get("years_of_driving_experience"))
                    if ebi >= 0:
                        self.exp_drivers[ebi] += 1
                        self.exp_acc_sets[ebi].add(row_index)
                        if sidx >= 1:
                            self.exp_severe[ebi] += 1
                        if tind == 0:
                            self.exp_night[ebi] += 1
                        self.exp_inj[ebi] += inj
                        self.exp_season[ebi][sind] += 1
                        self.exp_tod[ebi][tind] += 1
            if is_driver_violator:
                if not seen_culprit and b_idx >= 0:
                    culprit_brand_idx = b_idx
                    seen_culprit = True
                if b_idx >= 0:
                    self.culprit_by_brand[b] += 1
            else:
                if b_idx >= 0:
                    self.victim_by_brand[b] += 1
            if m:
                self.model_cnt[(b or "?") + "|" + m] += 1
                if b:
                    self.brand_models_total[b][m] += 1
                    if is_driver_violator:
                        self.brand_models_culprit[b][m] += 1
            if b and driver_viols:
                for _v in driver_viols:
                    self.brand_viol[b][_v] += 1
            if vc:
                self.veh_cat_cnt[vc] += 1
            if isinstance(vy, int) and 1950 <= vy <= year:
                age = year - vy
                bi = 0 if age <= 3 else 1 if age <= 7 else 2 if age <= 12 else 3
                self.age_buckets[AGE_LABELS[bi]] += 1

        # пешеходы-виновники
        ped_culprit = False
        for part in (p.get("participants") or []):
            if part.get("role") == "Пешеход" and (part.get("violations") or []):
                ped_culprit = True
                break
        if any(
            (part.get("violations") or []) and part.get("role") == "Водитель"
            for veh in vehs for part in (veh.get("participants") or [])
        ):
            self.accidents_with_vehicle_culprit += 1
        elif ped_culprit:
            self.pedestrian_culprit_accidents += 1

        max_exp = max(
            (exp_bucket_idx(part.get("years_of_driving_experience"))
             for veh in vehs for part in (veh.get("participants") or [])
             if part.get("role") == "Водитель"),
            default=-1,
        )

        self.total += 1  # row_index выше использует значение ДО инкремента

        rows_out.append([
            lat, lon, ym, dow, hour, sidx, ci, li, wi, ri,
            max_exp, first_brand_idx, dead, inj,
            culprit_brand_idx, len(vehs),
        ])

        # --- прочие счётчики ---
        self.by_year_acc[year] += 1
        self.by_year_dead[year] += dead
        self.by_year_inj[year] += inj
        self.sev_tot[sidx] += 1
        self.cat_cnt[p.get("category") or "Не указано"] += 1
        self.light_cnt[light] += 1
        self.weather_cnt[wname] += 1
        self.road_cnt[rname] += 1


def dump(path: pathlib.Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {path.relative_to(OUT)}: {path.stat().st_size / 1e6:.2f} МБ", flush=True)


# ------------------------------------------------------------------ советы
def build_rules(acc: Acc, baseline_sev: float) -> list[dict]:
    MIN_N_FREQ, MIN_N_SEV, LIFT_MIN = 400, 250, 1.20
    rules: list[dict] = []
    n_total = acc.total

    def add(rule_id, scope, when, lift, n, title, text, tags):
        rules.append({"id": rule_id, "scope": scope, "when": when,
                      "lift": round(lift, 2), "n": n,
                      "title": title, "text": text, "tags": tags})

    for t in range(4):
        n = acc.tod_cnt[t]
        lift = n / (n_total / 4)
        if n >= MIN_N_FREQ and lift >= LIFT_MIN:
            add(f"freq-tod-{t}", "time", {"tod": TODS[t]}, lift, n,
                f"{TODS[t]} — повышенный поток ДТП",
                f"На период {TODS[t].lower()} приходится {pct(n / n_total)} всех ДТП "
                f"(ожидалось бы 25%). Если есть выбор — планируй выезд вне этого окна.",
                ["время"])
        elif n >= MIN_N_FREQ and lift <= 1 / LIFT_MIN:
            add(f"quiet-tod-{t}", "time", {"tod": TODS[t]}, lift, n,
                f"{TODS[t]} — статистически спокойное окно",
                f"Доля ДТП за {TODS[t].lower()} всего {pct(n / n_total)} — "
                f"одно из самых безопасных окон суток.",
                ["время"])

    if acc.fri_evening > 200 and acc.other_evening > 200:
        per_day = acc.other_evening / 4
        lift = acc.fri_evening / per_day
        add("friday-evening", "time", {"weekday": "Пт", "hour_from": 17, "hour_to": 19},
            max(lift, 1 / lift), acc.fri_evening,
            "Пятница 17:00–19:00",
            f"В пятничный вечерний пик аварий на {pct(abs(lift - 1))} "
            f"{'больше' if lift > 1 else 'меньше'}, чем в те же часы среднего буднего дня (Пн–Чт).",
            ["время", "пятница"])

    for (s, t), n in sorted(acc.combo_season_tod.items()):
        lift = n / (n_total / 16)
        if n >= MIN_N_FREQ and lift >= LIFT_MIN:
            add(f"combo-{s}-{t}", "season_time", {"season": SEASONS[s], "tod": TODS[t]},
                lift, n, f"{SEASONS[s]}, {TODS[t].lower()}",
                f"Комбинация «{SEASONS[s]} + {TODS[t].lower()}» даёт {pct(lift - 1)} к средней "
                f"частоте аварий.", ["сезон", "время"])

    for wi, n in acc.wea_n.most_common():
        name = dict(acc.weathers).get(wi) or list(acc.weathers.keys())[wi]
        if name == "Не указано" or n < MIN_N_SEV:
            continue
        ratio = (acc.wea_sev[wi] / n) / baseline_sev
        if ratio >= LIFT_MIN:
            add(f"wea-{wi}", "weather", {"weather": name}, ratio, n,
                f"«{name}»: аварии тяжелее",
                f"При погоде «{name}» доля тяжёлых исходов {pct(acc.wea_sev[wi] / n)} против "
                f"{pct(baseline_sev)} в среднем ({ratio:.1f}×). Скорость ниже, дистанция больше.",
                ["погода", "тяжесть"])

    for li, n in acc.light_n.most_common():
        name = list(acc.lights.keys())[li]
        if name == "Не указано" or n < MIN_N_SEV:
            continue
        rate = acc.light_sev[li] / n
        ratio = rate / baseline_sev
        if ratio >= LIFT_MIN:
            add(f"light-{li}", "light", {"light": name}, ratio, n,
                f"«{name}»: риск тяжелее",
                f"При освещении «{name}» доля тяжёлых последствий {pct(rate)} ({ratio:.1f}× к среднему).",
                ["освещение", "тяжесть"])

    for ri, n in acc.road_n.most_common():
        name = list(acc.roads.keys())[ri]
        if name == "Не указано" or n < MIN_N_SEV:
            continue
        rate = acc.road_sev[ri] / n
        ratio = rate / baseline_sev
        if ratio >= LIFT_MIN:
            add(f"road-{ri}", "road", {"road_condition": name}, ratio, n,
                f"Покрытие «{name}»",
                f"На покрытии «{name}» доля тяжёлых ДТП {pct(rate)} ({ratio:.1f}× к среднему).",
                ["дорога", "тяжесть"])

    exp_texts = {
        "0–2": ("Стаж до 3 лет", "Новички чаще попадают в лёгкие столкновения: держи дистанцию."),
        "3–5": ("Стаж 3–5 лет", "Ранний опыт часто сопровождается самоуверенностью."),
        "6–10": ("Стаж 6–10 лет", "Самая многочисленная группа: следи за усталостью."),
        "11–15": ("Стаж 11–15 лет", "Опыт снижает простые ошибки, но растёт недооценка сложных условий."),
        "16–20": ("Стаж 16–20 лет", "Привычка к «уверенной» езде опасна в плохую погоду."),
        "21+": ("Стаж более 20 лет", "Главные риски — рутина и изменившиеся условия дороги."),
    }
    for i, bucket in enumerate(EXP_BUCKETS):
        n_acc = len(acc.exp_acc_sets[i])
        if n_acc < MIN_N_SEV:
            continue
        severe_share = acc.exp_severe[i] / n_acc
        ratio = severe_share / baseline_sev if baseline_sev else 0
        direction = "выше" if ratio > 1.08 else "ниже" if ratio < 0.92 else "на уровне"
        title, hint = exp_texts[bucket]
        add(f"exp-{bucket}", "experience", {"experience_bucket": bucket},
            max(ratio, 1 / ratio if ratio else 9), n_acc,
            f"{title}: тяжесть ДТП {direction} средней",
            f"У водителей со стажем «{bucket}» доля тяжёлых исходов {severe_share * 100:.0f}% "
            f"(в среднем {baseline_sev * 100:.0f}%). {hint}",
            ["стаж"])

    return rules


# ------------------------------------------------------------------- main
def main() -> int:
    import argparse as ap
    parser = ap.ArgumentParser()
    parser.add_argument("--only", help="список slug через запятую")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW / "manifest.json"
    if not manifest_path.exists():
        print("ОШИБКА: нет manifest.json — запусти download_all.py", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    slugs = sorted(manifest.keys())
    if args.only:
        wanted = {s.strip() for s in args.only.split(",")}
        slugs = [s for s in slugs if s in wanted]

    acc = Acc()
    region_infos = []
    started = dt.datetime.now(dt.timezone.utc)

    for num, slug in enumerate(slugs, 1):
        src = RAW / f"{slug}.geojson"
        if not src.exists() or src.stat().st_size < 1000:
            print(f"[{num}/{len(slugs)}] пропускаю {slug}: файла нет", flush=True)
            continue
        t0 = dt.datetime.now()
        rows: list = []
        name = slug
        r_min = r_max = None
        count = 0
        for feat in iter_features(src):
            props = feat.get("properties") or {}
            pr = (props.get("parent_region") or "").strip()
            if pr and name == slug:
                name = pr
            before = acc.total
            acc.feed(feat, rows)
            if acc.total > before:
                count += 1
                d = (props.get("datetime") or "")[:10]
                if d:
                    r_min = d if r_min is None or d < r_min else r_min
                    r_max = d if r_max is None or d > r_max else r_max
        if not rows:
            print(f"[{num}/{len(slugs)}] {slug}: пусто, пропускаю", flush=True)
            continue

        # Робастная чистка геометрии: редкие ошибки геокодинга источника
        # (точки в Африке/Европе внутри файла региона) ломают bbox.
        # Медиана + адаптивный радиус: обычным областям хватает базы,
        # огромным регионам (Красноярск) радиус растёт от их реального размаха.
        import statistics as _st

        _lats = sorted(r[0] for r in rows)
        _lons = sorted(r[1] for r in rows)
        _n = len(rows)

        def _q(arr: list, p: float):
            return arr[min(_n - 1, int(p * _n))]

        _mla, _mlo = _lats[_n // 2], _lons[_n // 2]
        _rla = max(3.0, (_q(_lats, 0.99) - _q(_lats, 0.01)) * 1.2)
        _rlo = max(5.0, (_q(_lons, 0.99) - _q(_lons, 0.01)) * 1.2)
        before_clean = len(rows)
        rows = [
            r for r in rows
            if abs(r[0] - _mla) <= _rla and abs(r[1] - _mlo) <= _rlo
        ]
        if len(rows) < before_clean:
            print(
                f"    чистка: отброшено {before_clean - len(rows)} точек с "
                f"невозможными координатами",
                flush=True,
            )

        lats = [r[0] for r in rows]
        lons = [r[1] for r in rows]
        region_infos.append({
            "slug": slug, "name": name, "total": len(rows),
            "date_min": r_min, "date_max": r_max,
            "bbox": [min(lats), max(lats), min(lons), max(lons)],
        })
        dump(OUT / "regions" / f"{slug}.json", {
            "slug": slug, "total": len(rows),
            "date_min": r_min, "date_max": r_max,
            "bbox": region_infos[-1]["bbox"],
            "rows": rows,
        })
        took = (dt.datetime.now() - t0).total_seconds()
        print(f"[{num}/{len(slugs)}] {name}: {len(rows):>6} ДТП за {took:.1f} c", flush=True)
        rows.clear()

    # ---- словари ----
    dump(OUT / "dictionaries.json", {
        "cats": list(acc.cats.keys()),
        "sevs": SEV_ORDER,
        "lights": list(acc.lights.keys()),
        "weathers": list(acc.weathers.keys()),
        "roads": list(acc.roads.keys()),
        "brands": list(acc.brands.keys()),
    })

    total = acc.total
    baseline_sev = (acc.sev_tot[1] + acc.sev_tot[2]) / total if total else 0
    years_sorted = sorted(acc.month_year.keys())

    # ---- национальные агрегаты ----
    top_brands = [
        {"name": b, "count": c,
         "severe_share": round((acc.brand_sev[b][1] + acc.brand_sev[b][2]) / c, 3)}
        for b, c in acc.brand_cnt.most_common(40)
    ]
    culprits_brands = []
    for b, cnt in acc.culprit_by_brand.most_common(45):
        vic = acc.victim_by_brand.get(b, 0)
        tot = cnt + vic
        culprits_brands.append({
            "brand": b, "culprit": cnt, "victim": vic, "total": tot,
            "aggr": round(cnt / tot, 3) if tot else 0,
        })

    national = {
        "overview": {
            "by_year": [{"year": y, "accidents": acc.by_year_acc[y],
                         "dead": acc.by_year_dead[y], "injured": acc.by_year_inj[y]}
                        for y in years_sorted],
            "severity_totals": [acc.sev_tot[i] for i in range(3)],
            "categories": acc.cat_cnt.most_common(),
            "lights": acc.light_cnt.most_common(),
            "weathers": acc.weather_cnt.most_common(),
            "roads": acc.road_cnt.most_common(),
        },
        "temporal": {
            "weekdays": WEEKDAYS, "tods": TODS, "seasons": SEASONS,
            "hour_weekday": acc.hour_weekday, "by_hour": acc.by_hour,
            "hour_severity": acc.hour_sev, "by_month": acc.by_month,
            "years": years_sorted,
            "month_year": [acc.month_year[y] for y in years_sorted],
            "season_counts": {s: acc.season_cnt[s] for s in SEASONS},
            "tod_severity": acc.tod_sev,
        },
        "vehicles": {
            "top_brands": top_brands,
            "top_models": [{"brand": bm.split("|", 1)[0], "model": bm.split("|", 1)[1], "count": c}
                           for bm, c in acc.model_cnt.most_common(40)],
            "vehicle_categories": acc.veh_cat_cnt.most_common(15),
            "age_labels": AGE_LABELS,
            "age_counts": [acc.age_buckets.get(a, 0) for a in AGE_LABELS],
        },
        "experience": {
            "buckets": EXP_BUCKETS,
            "baseline_severe_share": round(baseline_sev, 3),
            "stats": [{
                "bucket": EXP_BUCKETS[i],
                "drivers": acc.exp_drivers[i],
                "accidents": len(acc.exp_acc_sets[i]),
                "severe_share": round(acc.exp_severe[i] / len(acc.exp_acc_sets[i]), 3) if acc.exp_acc_sets[i] else 0,
                "night_share": round(acc.exp_night[i] / len(acc.exp_acc_sets[i]), 3) if acc.exp_acc_sets[i] else 0,
                "avg_injured": round(acc.exp_inj[i] / len(acc.exp_acc_sets[i]), 2) if acc.exp_acc_sets[i] else 0,
            } for i in range(len(EXP_BUCKETS))],
            "bucket_season": acc.exp_season,
            "bucket_tod": acc.exp_tod,
        },
        "culprits": {
            "methodology": "Виновником считается водитель, у которого в записи есть нарушения ПДД "
                           "(поле violations источника). Марка виновника — марка его транспортного средства.",
            "totals": {
                "accidents": total,
                "with_vehicle_culprit": acc.accidents_with_vehicle_culprit,
                "pedestrian_culprit": acc.pedestrian_culprit_accidents,
            },
            "violations_top": acc.violations_top.most_common(15),
            "brands": culprits_brands,
        },
    }
    dump(OUT / "national.json", national)

    # ---- детали по маркам (эксплорер автопрома) ----
    # ВАЖНО: поле model в исходном geojson ненадёжно (марки и модели
    # перемешаны источником), поэтому модели не публикуем.
    brands_detail = {}
    for b in acc.brands.keys():
        sev_c = acc.brand_sev.get(b)
        if not sev_c:
            continue
        sev = [int(sev_c.get(i, 0)) for i in range(3)]
        if sum(sev) == 0:
            continue
        brands_detail[b] = {
            "total": sum(sev),
            "sev": sev,
            "culprit": acc.culprit_by_brand.get(b, 0),
            "victim": acc.victim_by_brand.get(b, 0),
            "violations": [[t, c] for t, c in acc.brand_viol[b].most_common(6)],
        }
    dump(OUT / "brands.json", {
        "generated_at_utc": started.isoformat(),
        "brands": brands_detail,
    })

    # ---- тепловые ячейки ----
    # Ячейка живёт, только если попадает в bbox хотя бы одного очищенного
    # региона — так на глобальной карте не остаётся «звёзд» от мусорных
    # координат источника.
    _boxes = [r["bbox"] for r in region_infos]

    def _cell_ok(la: float, lo: float) -> bool:
        for b in _boxes:
            if b[0] - 0.3 <= la <= b[1] + 0.3 and b[2] - 0.5 <= lo <= b[3] + 0.5:
                return True
        return False

    cells = []
    dropped_cells = 0
    for key, cnt in acc.heat_cells.items():
        if ":" in key:
            continue
        cla, clo = geohash_decode(key)
        if not _cell_ok(cla, clo):
            dropped_cells += cnt
            continue
        dead = acc.heat_cells.get(key + ":d", 0)
        inj = acc.heat_cells.get(key + ":i", 0)
        s0 = acc.heat_cells.get(key + ":s0", 0)
        s1 = acc.heat_cells.get(key + ":s1", 0)
        s2 = cnt - s0 - s1
        cells.append([key, s0, s1, s2, dead, inj])
    cells.sort(key=lambda c: -(c[1] + c[2] + c[3]))
    dump(OUT / "heat_cells.json", cells)
    if dropped_cells:
        print(f"    heat: отброшено {dropped_cells} ДТП вне bbox регионов", flush=True)

    # ---- советы ----
    rules = build_rules(acc, baseline_sev)
    dump(OUT / "tips.json", {
        "generated_at_utc": started.isoformat(),
        "baseline": {"severe_share": round(baseline_sev, 3), "accidents_total": total},
        "thresholds": {"min_n": [400, 250], "lift_min": 1.2},
        "rules": rules,
    })

    # ---- meta ----
    dl_meta_path = RAW / "download_meta.json"
    dl_meta = json.loads(dl_meta_path.read_text(encoding="utf-8")) if dl_meta_path.exists() else {}
    dump(OUT / "meta.json", {
        "schema_version": 2,
        "generated_at_utc": started.isoformat(),
        "source_page": dl_meta.get("opendata_page") or "https://dtp-stat.ru/opendata/",
        "coverage": "Российская Федерация",
        "total_accidents": total,
        "date_min": acc.date_min,
        "date_max": acc.date_max,
        "regions_processed": len(region_infos),
        "regions": region_infos,
        "totals": {"dead": sum(acc.by_year_dead.values()), "injured": sum(acc.by_year_inj.values())},
    })

    print(f"\nГОТОВО: {total} ДТП, {len(region_infos)} регионов.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
