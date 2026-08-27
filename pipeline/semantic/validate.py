"""Validation run Semantic Contract v1 по всей raw базе — полный (честный) coverage.

Каждый контракт: source_total (все сущности), source_missing, mapped (of present),
mapped (of ALL), unknown, other, ambiguous, sentinel. Разделены причины отсутствия:
source_missing / unknown / ambiguous.

Дополнительно:
  - local_region: coverage + composite key (region_subject + local_region) + collisions
  - Schema Drift Guard: observed_* (все встреченные ключи) и unknown_* = observed - expected
    (expected задан в контракте; unknown-множества должны быть пустыми).
Пишет docs/semantic-contract-v1.json. НЕ меняет product pipeline.
"""
from __future__ import annotations

import collections
import datetime as dt
import json
import pathlib

import ijson
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import contract  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent  # DTP_Anatytics/
RAW = ROOT / "data" / "raw"
DOCS = ROOT / "docs"

# Ожидаемая схема (для Schema Drift) — штатные ключи
EXPECTED_TOP = {"id", "tags", "light", "point", "nearby", "region", "scheme", "address",
                "weather", "category", "datetime", "severity", "vehicles", "dead_count",
                "gibdd_number", "participants", "injured_count", "parent_region",
                "road_conditions", "participants_count", "participant_categories"}
EXPECTED_VEH = {"year", "brand", "color", "model", "category", "participants"}
EXPECTED_PART = {"id", "role", "gender", "violations", "health_status", "years_of_driving_experience"}


def stream_features(path):
    with open(path, "rb") as fh:
        yield from ijson.items(fh, "features.item")


def pct(n, d):
    """Процент с 3 знаками — не округляем 99.996 до 100.0, если остаются unknowns."""
    return round(n / d * 100, 3) if d else 0


def main():
    files = sorted(RAW.glob("*.geojson"))
    files = [f for f in files if f.stat().st_size > 200_000]
    print(f"Регионов: {len(files)}", flush=True)

    vehicle = {"source_total": 0, "source_missing": 0, "present": 0, "mapped": 0,
               "unknown": 0, "by_super": collections.Counter()}
    outcome = {"source_total": 0, "source_missing": 0, "present": 0, "mapped": 0,
               "unknown": 0, "by_group": collections.Counter()}
    infra = {"source_total": 0, "present": 0, "mapped": 0, "unknown": 0,
             "by_group": collections.Counter(), "by_facet": collections.Counter()}
    ptype = {"source_total": 0, "source_missing": 0, "present": 0, "mapped": 0,
             "other": 0, "ambiguous": 0, "sentinel": 0, "unknown": 0,
             "by_type": collections.Counter()}
    brand = {"source_total": 0, "source_missing": 0, "present": 0, "pass_through": 0,
             "aggregate": 0, "unknown": 0}
    scheme = {"source_total": 0, "source_missing": 0, "present": 0, "unresolved": 0,
              "no_scheme": 0, "unknown": 0}
    region = {"processed": 0, "conflicts": 0}
    local_region = {"present": 0, "missing": 0, "unique": 0, "collisions": 0,
                    "composite": collections.Counter()}

    drift_top = collections.Counter()
    drift_veh = collections.Counter()
    drift_part = collections.Counter()
    top_unmapped_v = collections.Counter()
    top_unmapped_pt = collections.Counter()

    for fi, f in enumerate(files, 1):
        slug = f.stem
        region["processed"] += 1
        try:
            for feat in stream_features(f):
                p = feat.get("properties") or {}
                for k in p.keys():
                    drift_top[k] += 1

                # scheme
                scheme["source_total"] += 1
                sc = p.get("scheme")
                s_val = str(sc).strip() if sc is not None and str(sc).strip() else None
                if s_val is None:
                    scheme["source_missing"] += 1
                else:
                    scheme["present"] += 1
                    status, _n = contract.crash_scheme(s_val)
                    if status in ("no_scheme", "upstream_excluded"):
                        scheme["no_scheme"] += 1
                    elif status == "unresolved":
                        scheme["unresolved"] += 1
                    else:
                        scheme["unknown"] += 1

                # local_region
                lr = p.get("region")
                lr_val = str(lr).strip() if lr is not None and str(lr).strip() else None
                if lr_val is None:
                    local_region["missing"] += 1
                else:
                    local_region["present"] += 1
                    # composite: subject(id) + normalized local_region
                    subj_id, _name = contract.region_subject(slug)
                    norm = " ".join(lr_val.split()).lower()
                    composite = (subj_id, norm)
                    local_region["composite"][composite] += 1

                # infrastructure (multi-value)
                nonempty = [str(x).strip() for x in (p.get("nearby") or []) if x is not None and str(x).strip()]
                for el in nonempty:
                    infra["source_total"] += 1
                    detail, group, facets = contract.infrastructure(el)
                    infra["present"] += 1
                    if group == "unknown":
                        infra["unknown"] += 1
                    else:
                        infra["mapped"] += 1
                    infra["by_group"][group] += 1
                    for fac in facets:
                        infra["by_facet"][fac] += 1

                # participants standalone
                for part in (p.get("participants") or []):
                    if isinstance(part, dict):
                        for k in part.keys():
                            drift_part[k] += 1
                        _feed_ptype(part, ptype, top_unmapped_pt)
                        _feed_outcome(part, outcome)

                # vehicles
                for vh in (p.get("vehicles") or []):
                    if not isinstance(vh, dict):
                        continue
                    for k in vh.keys():
                        drift_veh[k] += 1
                    _feed_vehicle(vh, vehicle, top_unmapped_v)
                    _feed_brand(vh, brand)
                    for part in (vh.get("participants") or []):
                        if isinstance(part, dict):
                            for k in part.keys():
                                drift_part[k] += 1
                            _feed_ptype(part, ptype, top_unmapped_pt)
                            _feed_outcome(part, outcome)
        except Exception as e:  # noqa: BLE001
            print(f"  ERR {slug}: {e}", flush=True)
        if fi % 10 == 0:
            print(f"  [{fi}/{len(files)}] {slug} vtotal={vehicle['source_total']}", flush=True)

    # collisions: составные ключи, у которых local_region одинаковое имя встречается в разных субъектах
    # и внутри одного субъекта повторяется (не уникальное)
    composite_counts = local_region["composite"]
    same_name_multisubject = collections.defaultdict(set)  # normalized local_region -> set(subject_id)
    for (subj, norm), c in composite_counts.items():
        same_name_multisubject[norm].add(subj)
    subj_collisions = sum(1 for _n, subs in same_name_multisubject.items() if len(subs) > 1)

    reporting = {
        "contract_version": contract.SEMANTIC_CONTRACT_VERSION,
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "methodology": "Все знаменатели от полной сущности (source_total), включая source_missing. Разделены source_missing/unknown/ambiguous.",
        "schema_drift": {
            "expected_top_level_keys": sorted(EXPECTED_TOP),
            "observed_top_level_keys": sorted(drift_top.keys()),
            "unknown_top_level_keys": sorted(drift_top.keys() - EXPECTED_TOP),
            "expected_vehicle_keys": sorted(EXPECTED_VEH),
            "observed_vehicle_keys": sorted(drift_veh.keys()),
            "unknown_vehicle_keys": sorted(drift_veh.keys() - EXPECTED_VEH),
            "expected_participant_keys": sorted(EXPECTED_PART),
            "observed_participant_keys": sorted(drift_part.keys()),
            "unknown_participant_keys": sorted(drift_part.keys() - EXPECTED_PART),
            "unknown_top_level_count": len(drift_top.keys() - EXPECTED_TOP),
            "unknown_vehicle_count": len(drift_veh.keys() - EXPECTED_VEH),
            "unknown_participant_count": len(drift_part.keys() - EXPECTED_PART),
        },
        "vehicle_supercategory": _report_vehicle(vehicle, top_unmapped_v),
        "human_outcome": _report_outcome(outcome),
        "infrastructure": _report_infra(infra),
        "participant_type": _report_ptype(ptype, top_unmapped_pt),
        "region_subject": {"processed": region["processed"], "conflicts": region["conflicts"]},
        "local_region": {
            "present": local_region["present"],
            "missing": local_region["missing"],
            "unique_composite_keys": len(composite_counts),
            "same_name_across_subjects": subj_collisions,
            "note": "composite key = region_subject_id + normalized local_region; collisions = одинаковые имена районов, встречающиеся в >1 субъекте",
        },
        "crash_scheme": _report_scheme(scheme),
        "brand": _report_brand(brand),
    }

    out = DOCS / "semantic-contract-v1.json"
    out.write_text(json.dumps(reporting, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nJSON: {out}", flush=True)
    print(f"vehicle: src={vehicle['source_total']} miss={vehicle['source_missing']} mapped={vehicle['mapped']} unk={vehicle['unknown']}", flush=True)
    print(f"participant: src={ptype['source_total']} mapped={ptype['mapped']} other={ptype['other']} ambig={ptype['ambiguous']} sentinel={ptype['sentinel']} unk={ptype['unknown']}", flush=True)
    print(f"schema_drift unknown: top={len(drift_top.keys()-EXPECTED_TOP)} veh={len(drift_veh.keys()-EXPECTED_VEH)} part={len(drift_part.keys()-EXPECTED_PART)}", flush=True)
    return 0


def _feed_vehicle(vh, acc, top_unmapped):
    acc["source_total"] += 1
    c = vh.get("category")
    c_val = str(c).strip() if c is not None and str(c).strip() else None
    if c_val is None:
        acc["source_missing"] += 1
        return
    acc["present"] += 1
    sup, status = contract.vehicle_supercategory(c_val)
    if sup in ("unknown",) or status == "unknown":
        acc["unknown"] += 1
        top_unmapped[c_val] += 1
    else:
        acc["mapped"] += 1
        acc["by_super"][sup] += 1


def _feed_brand(vh, acc):
    acc["source_total"] += 1
    b = vh.get("brand")
    b_val = str(b).strip() if b is not None and str(b).strip() else None
    if b_val is None:
        acc["source_missing"] += 1
        return
    acc["present"] += 1
    label, status = contract.brand_bucket(b_val)
    if status == "aggregate" or label not in ("pass_through",):
        acc["aggregate"] += 1
    else:
        acc["pass_through"] += 1


def _feed_ptype(part, acc, top_unmapped):
    acc["source_total"] += 1
    r = part.get("role")
    r_val = str(r).strip() if r is not None and str(r).strip() else None
    if r_val is None:
        acc["source_missing"] += 1
        return
    acc["present"] += 1
    typ, status = contract.participant_type(r_val)
    if status == "sentinel":
        acc["sentinel"] += 1
    elif status == "ambig" or typ in ("pedestrian_from_vehicle",):
        acc["ambiguous"] += 1
        top_unmapped[r_val] += 1
    elif status == "unknown" or typ == "unknown":
        acc["unknown"] += 1
    elif status == "other":
        acc["other"] += 1
    else:
        acc["mapped"] += 1
    acc["by_type"][typ] += 1


def _feed_outcome(part, acc):
    acc["source_total"] += 1
    hs = part.get("health_status")
    hs_val = str(hs).strip() if hs is not None and str(hs).strip() else None
    if hs_val is None:
        acc["source_missing"] += 1
        return
    acc["present"] += 1
    detail, group = contract.human_outcome(hs_val)
    if group == "unknown":
        acc["unknown"] += 1
    else:
        acc["mapped"] += 1
        acc["by_group"][group] += 1


def _report_vehicle(acc, top_unmapped):
    total = acc["source_total"]
    return {
        "source_total": total, "source_missing": acc["source_missing"],
        "source_missing_pct": pct(acc["source_missing"], total), "present": acc["present"],
        "mapped": acc["mapped"],
        "mapped_of_present_pct": pct(acc["mapped"], acc["present"]),
        "mapped_of_all_pct": pct(acc["mapped"], total),
        "unknown": acc["unknown"],
        "unknown_of_present_pct": pct(acc["unknown"], acc["present"]),
        "unknown_of_all_pct": pct(acc["unknown"], total),
        "by_super": dict(acc["by_super"].most_common()),
        "top_unmapped": top_unmapped.most_common(20),
    }


def _report_outcome(acc):
    total = acc["source_total"]
    return {
        "source_total": total, "source_missing": acc["source_missing"],
        "source_missing_pct": pct(acc["source_missing"], total), "present": acc["present"],
        "mapped": acc["mapped"],
        "mapped_of_present_pct": pct(acc["mapped"], acc["present"]),
        "mapped_of_all_pct": pct(acc["mapped"], total),
        "unknown": acc["unknown"],
        "unknown_of_present_pct": pct(acc["unknown"], acc["present"]),
        "unknown_of_all_pct": pct(acc["unknown"], total),
        "by_group": dict(acc["by_group"].most_common()),
    }


def _report_infra(acc):
    total = acc["source_total"]
    return {
        "source_total": total, "present": acc["present"],
        "mapped": acc["mapped"], "unknown": acc["unknown"],
        "mapped_of_present_pct": pct(acc["mapped"], acc["present"]),
        "unknown_of_present_pct": pct(acc["unknown"], acc["present"]),
        "group_breakdown": dict(acc["by_group"].most_common()),
        "facet_breakdown": dict(acc["by_facet"].most_common()),
    }


def _report_ptype(acc, top_unmapped):
    total = acc["source_total"]
    return {
        "source_total": total, "source_missing": acc["source_missing"],
        "source_missing_pct": pct(acc["source_missing"], total), "present": acc["present"],
        "mapped": acc["mapped"], "other": acc["other"], "ambiguous": acc["ambiguous"],
        "sentinel": acc["sentinel"], "unknown": acc["unknown"],
        "by_type": dict(acc["by_type"].most_common()),
        "top_ambiguous": top_unmapped.most_common(10),
        "mapped_pct_of_present": pct(acc["mapped"], acc["present"]),
        "other_pct_of_present": pct(acc["other"], acc["present"]),
        "ambiguous_pct_of_present": pct(acc["ambiguous"], acc["present"]),
        "sentinel_pct_of_present": pct(acc["sentinel"], acc["present"]),
        "unknown_pct_of_present": pct(acc["unknown"], acc["present"]),
    }


def _report_scheme(acc):
    total = acc["source_total"]
    return {
        "source_total": total, "source_missing": acc["source_missing"],
        "source_missing_pct": pct(acc["source_missing"], total), "present": acc["present"],
        "unresolved": acc["unresolved"], "no_scheme": acc["no_scheme"], "unknown": acc["unknown"],
    }


def _report_brand(acc):
    total = acc["source_total"]
    return {
        "source_total": total, "source_missing": acc["source_missing"],
        "source_missing_pct": pct(acc["source_missing"], total), "present": acc["present"],
        "pass_through": acc["pass_through"], "aggregate": acc["aggregate"],
        "pass_through_pct_of_present": pct(acc["pass_through"], acc["present"]),
        "aggregate_pct_of_present": pct(acc["aggregate"], acc["present"]),
        "pass_through_pct_of_all": pct(acc["pass_through"], total),
        "aggregate_pct_of_all": pct(acc["aggregate"], total),
        "source_missing_pct_of_all": pct(acc["source_missing"], total),
    }


if __name__ == "__main__":
    sys.exit(main())
