"""Извлечение ПОЛНЫХ RAW-инвентаризаций для Semantic Contract Phase 1A.

Стримит все регионы, собирает ВСЕ distinct значения + счётчики для:
  - vehicles[].category (полный)
  - vehicles[].brand (полный)
  - participants[].health_status (полный)
  - properties.nearby (полный)
  - participants[].role (полный)
  - properties.scheme (полный)
  - properties.region (полный, local_region)
  - parent_region -> per-slug конфликты
Плюс контекстную связку для participant_type:
  role + context(inside vehicle / standalone) + participant_categories + violations присутствие.
"""
from __future__ import annotations

import collections
import json
import os
import pathlib

import ijson

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "docs"

def stream_features(path):
    with open(path, "rb") as fh:
        yield from ijson.items(fh, "features.item")

def main():
    files = sorted(RAW.glob("*.geojson"))
    files = [f for f in files if f.stat().st_size > 200_000]
    print(f"Регионов: {len(files)}", flush=True)

    cat_all = collections.Counter()          # vehicles.category
    brand_all = collections.Counter()        # vehicles.brand
    health_all = collections.Counter()       # participants.health_status
    nearby_all = collections.Counter()       # properties.nearby elements
    role_all = collections.Counter()         # participants.role
    scheme_all = collections.Counter()       # properties.scheme
    local_region_all = collections.Counter() # properties.region
    violations_all = collections.Counter()   # participants.violations (все элементы)

    # region subject: slug -> counter of parent_region values
    slug_parent = collections.defaultdict(collections.Counter)
    slug_local = collections.defaultdict(collections.Counter)  # slug -> top local regions

    # контекст участника: (role, context, has_categories_flag) -> count
    # context: "vehicle" | "standalone"
    part_ctx = collections.Counter()
    # role в связке с category присутствием
    role_cat_flag = collections.Counter()    # (role, "has_participant_categories"|"no")

    # Глобальные счётчики сущностей
    total_acc = 0
    total_veh = 0
    total_part_in_veh = 0
    total_part_standalone = 0
    total_participants = 0

    # vehicle category -> примеры (slug, sample) не нужно; только counts
    # аномалии brand alias: латиница/кириллица варианты одного бренда
    brand_lower = collections.Counter()  # нижний регистр бренд -> count (для alias-детекта)

    for fi, f in enumerate(files, 1):
        slug = f.stem
        try:
            for feat in stream_features(f):
                p = feat.get("properties") or {}
                total_acc += 1
                pr = p.get("parent_region")
                if pr:
                    slug_parent[slug][str(pr)] += 1

                # nearby элементы
                for el in (p.get("nearby") or []):
                    if el and str(el).strip():
                        nearby_all[str(el).strip()] += 1

                scheme = p.get("scheme")
                if scheme is not None and str(scheme).strip():
                    scheme_all[str(scheme).strip()] += 1

                lr = p.get("region")
                if lr and str(lr).strip():
                    local_region_all[str(lr).strip()] += 1
                    slug_local[slug][str(lr).strip()] += 1

                # участники standalone
                for part in (p.get("participants") or []):
                    if not isinstance(part, dict):
                        continue
                    total_part_standalone += 1
                    r = str(part.get("role") or "")
                    if r.strip():
                        role_all[r.strip()] += 1
                        part_ctx[(r.strip(), "standalone")] += 1
                    hs = part.get("health_status")
                    if hs is not None and str(hs).strip():
                        health_all[str(hs).strip()] += 1
                    for v in (part.get("violations") or []):
                        if v and str(v).strip():
                            violations_all[str(v).strip()] += 1

                # vehicles
                vehs = p.get("vehicles") or []
                for v in vehs:
                    if not isinstance(v, dict):
                        continue
                    total_veh += 1
                    c = v.get("category")
                    if c is not None and str(c).strip():
                        cat_all[str(c).strip()] += 1
                    b = v.get("brand")
                    if b is not None and str(b).strip():
                        brand_all[str(b).strip()] += 1
                        brand_lower[str(b).strip().lower()] += 1
                    for part in (v.get("participants") or []):
                        if not isinstance(part, dict):
                            continue
                        total_part_in_veh += 1
                        total_participants += 1
                        r = str(part.get("role") or "")
                        if r.strip():
                            role_all[r.strip()] += 1
                            part_ctx[(r.strip(), "vehicle")] += 1
                        hs = part.get("health_status")
                        if hs is not None and str(hs).strip():
                            health_all[str(hs).strip()] += 1
                        for vv in (part.get("violations") or []):
                            if vv and str(vv).strip():
                                violations_all[str(vv).strip()] += 1
                # standalone участники также считаются в total для health отдельно уже сделано
                # (подсчёт total_participants только в ТС — standalone отдельно)
        except Exception as e:  # noqa: BLE001
            print(f"  ERR {slug}: {e}", flush=True)

        if fi % 10 == 0:
            print(f"  [{fi}/{len(files)}] {slug} acc={total_acc}", flush=True)

    inv = {
        "meta": {
            "generated_at_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            "regions": len(files),
            "total_accidents": total_acc,
            "total_vehicles": total_veh,
            "total_participants_in_vehicles": total_part_in_veh,
            "total_participants_standalone": total_part_standalone,
        },
        "vehicle_category": [{"value": v, "count": c} for v, c in cat_all.most_common()],
        "vehicle_brand": [{"value": v, "count": c} for v, c in brand_all.most_common()],
        "health_status": [{"value": v, "count": c} for v, c in health_all.most_common()],
        "nearby": [{"value": v, "count": c} for v, c in nearby_all.most_common()],
        "role": [{"value": v, "count": c} for v, c in role_all.most_common()],
        "scheme": [{"value": v, "count": c} for v, c in scheme_all.most_common()],
        "local_region": [{"value": v, "count": c} for v, c in local_region_all.most_common()],
        "violations": [{"value": v, "count": c} for v, c in violations_all.most_common()],
        "participant_context": {f"{r}|{ctx}": c for (r, ctx), c in part_ctx.items()},
        "slug_parent": {k: dict(v.most_common()) for k, v in slug_parent.items()},
        "slug_local_top": {k: v.most_common(3) for k, v in slug_local.items()},
        "brand_lower_counts": {k: c for k, c in brand_lower.most_common()},
    }
    out = OUT / "semantic-raw-inventory.json"
    out.write_text(json.dumps(inv, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nИТОГ: acc={total_acc} veh={total_veh} part_in_veh={total_part_in_veh} standalone={total_part_standalone}", flush=True)
    print(f"cat={len(cat_all)} brand={len(brand_all)} health={len(health_all)} nearby={len(nearby_all)} role={len(role_all)} scheme={len(scheme_all)} local_region={len(local_region_all)}", flush=True)
    print(f"written: {out}", flush=True)

if __name__ == "__main__":
    main()
