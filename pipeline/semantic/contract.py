"""Semantic Contract v1 — контракт нормализации между raw и продуктом.

Phase 1A: ДЕТЕРМИНИРОВАННЫЙ, РЕЦЕНЗИРУЕМЫЙ, ВЕРСИОНИРОВАННЫЙ слой.
Mapping-таблицы — JSON в pipeline/semantic/ (не зашиты в if/else).
Этот модуль — единственная точка чтения контракта. НЕ встроен в build_all.py.

SEMANTIC_CONTRACT_VERSION = 1
"""
from __future__ import annotations

import json
import pathlib

SEMANTIC_CONTRACT_VERSION = 1

HERE = pathlib.Path(__file__).resolve().parent
MAPPING_DIR = HERE

# Кэш загруженных таблиц
_tables: dict[str, dict] = {}


def _load(name: str) -> dict:
    if name not in _tables:
        p = MAPPING_DIR / f"mapping_{name}.json"
        _tables[name] = json.loads(p.read_text(encoding="utf-8"))
    return _tables[name]


def contract_version() -> int:
    return SEMANTIC_CONTRACT_VERSION


# ---------------------------------------------------------------- vehicle
def vehicle_supercategory(raw: str | None) -> tuple[str, str]:
    """RAW vehicles[].category -> (supercategory, status). Status: mapped|unknown.
    Неизвестное/None -> ('unknown','unknown'). Агрегаты 'Прочие/Иные' не приводятся
    к конкретному классу — их явная категория уже назначена в mapping."""
    if not raw:
        return ("unknown", "unknown")
    t = _load("vehicle")
    row = t["mapping"].get(raw)
    if row:
        return (row[0], row[1])
    # явный fallback unknown (не угадываем)
    return ("unknown", "unknown")


# ---------------------------------------------------------------- outcomes
def human_outcome(raw: str | None) -> tuple[str, str]:
    """RAW participants[].health_status -> (detail, group)."""
    t = _load("outcomes")
    if raw:
        row = t["mapping"].get(raw)
        if row:
            return (row[0], row[1])
    return ("unknown", "unknown")


# ---------------------------------------------------------------- infrastructure
def infrastructure(raw: str | None) -> tuple[str, str, list[str]]:
    """RAW nearby-элемент -> (detail, group, facets). Multi-value: вызывается
    для каждого элемента. facets — набор смысловых аспектов для составных значений."""
    t = _load("infrastructure")
    if raw:
        row = t["mapping"].get(raw)
        if row:
            return (row["detail"], row["group"], row.get("facets", [row["group"]]))
    return ("unknown", "unknown", ["unknown"])


# ---------------------------------------------------------------- participant
def participant_type(raw: str | None) -> tuple[str, str]:
    """RAW participants[].role -> (type, status). row может быть [type,status] или
    [type,status,detail]. Детализация о prior vehicle role — в detail, не сказывается
    на ambiguous-статусе participant_type."""
    t = _load("participants")
    if raw:
        row = t["mapping"].get(raw)
        if row:
            typ = row[0]
            status = row[1] if len(row) > 1 else "mapped"
            return (typ, status)
    return ("unknown", "unknown")


# ---------------------------------------------------------------- region
def region_subject(slug: str) -> tuple[str, str]:
    """slug файла -> (canonical_id, canonical_name). Источник истины — slug."""
    t = _load("region")
    r = t["regions"].get(slug)
    if r:
        return (r["canonical_id"], r["canonical_name"])
    return (slug, slug.replace("-", " ").title())


# ---------------------------------------------------------------- scheme
def crash_scheme(raw: str | None) -> tuple[str, str]:
    """RAW properties.scheme -> (status, note). Status: unresolved|no_scheme."""
    t = _load("schemes")
    if raw:
        row = t["mapping"].get(raw)
        if row:
            return (row["status"], row.get("note", ""))
    return ("unknown", "no data")


def crash_scheme_provenance() -> dict:
    """Возвращает provenance-запись (repo/path/commit/правило/дата) для служебных кодов."""
    t = _load("schemes")
    return t.get("provenance", {})


# ---------------------------------------------------------------- brand
def brand_bucket(raw: str | None) -> tuple[str, str]:
    """RAW vehicles[].brand -> (canonical label, status). Конкретные бренды pass-through."""
    t = _load("brands")
    if raw:
        row = t["mapping"].get(raw)
        if row:
            return (row[0], row[1])
    # pass-through: не агрегат -> считать raw брендом
    return ("pass_through", "brand")


# ---------------------------------------------------------------- helpers
def canonical_names(attr: str) -> list[str]:
    """Канонический упорядоченный список допустимых значений атрибута для битмасок.
    Источник — зафиксированный порядок в mapping JSON (supercategories/types/groups),
    без 'unknown' (unknown не кодируется битом). Детерминирован и одинаков во всех регионах."""
    if attr == "vehicle":
        lst = _load("vehicle").get("supercategories", [])
    elif attr == "participant":
        lst = _load("participants").get("types", [])
    elif attr == "outcome":
        lst = _load("outcomes").get("groups", [])
    elif attr == "infrastructure":
        lst = _load("infrastructure").get("groups", [])
    else:
        return []
    return [x for x in lst if x != "unknown"]


def bit_index(attr: str, name: str) -> int:
    """Фиксированный бит-индекс значения в каноническом списке (по порядку из контракта).
    Возвращает -1, если значение отсутствует (в т.ч. unknown)."""
    try:
        return canonical_names(attr).index(name)
    except ValueError:
        return -1


def all_fields_known_for(attr: str, raw: str | None) -> bool:
    """Для schema-drift: известен ли raw в соответствующем mapping."""
    if attr == "vehicle":
        return (raw or "") in _load("vehicle")["mapping"]
    if attr == "outcome":
        return (raw or "") in _load("outcomes")["mapping"]
    if attr == "infrastructure":
        return (raw or "") in _load("infrastructure")["mapping"]
    if attr == "participant":
        return (raw or "") in _load("participants")["mapping"]
    if attr == "scheme":
        return (raw or "") in _load("schemes")["mapping"]
    if attr == "brand":
        return (raw or "") in _load("brands")["mapping"]
    return False
