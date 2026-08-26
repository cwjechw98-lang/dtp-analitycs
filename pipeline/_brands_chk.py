import json

d = json.load(open("../web/public/data/brands.json", encoding="utf-8"))
brands = d["brands"]
print("Всего марок в файле:", len(brands))

targets = ["HAVAL", "CHERY", "GEELY", "CHANGAN", "EXEED", "OMODA", "JAC", "GREAT WALL",
           "KIA", "HYUNDAI", "LADA", "TOYOTA", "BMW", "BYD", "WULING", "BRILLIANCE",
           "ZOTYE", "DONGFENG", "GWM", "JETOUR", "TANK", "LYNK", "FAW", "BAIC", "MG",
           "SSANGYONG", "DAEWOO", "VW", "VOLKSWAGEN", "HONDA", "MERCEDES", "RENAULT"]
hits = {}
for t in targets:
    if t in brands:
        hits[t] = brands[t]["total"]
print("Точные совпадения:", {k: v for k, v in hits.items()})

print("--- китайские/корейские по подстроке ---")
keys = list(brands.keys())
for name in keys:
    u = name.upper()
    if any(k in u for k in ["HAVAL", "CHERY", "GEELY", "CHANGAN", "EXEED", "OMODA", "BYD",
                            "JETOUR", "TANK", "WULING", "JAC", "GREAT", "BRILLIANCE", "ZOTYE",
                            "DONGFENG", "FAW", "BAIC", "MG", "KIA", "HYUNDAI", "SSANG",
                            "CHINE", "GREATWALL", "GWM"]):
        print(f"  {name:<22} total={brands[name]['total']}")

print("--- ТОП-30 по total ---")
for name, val in sorted(brands.items(), key=lambda x: -x[1]["total"])[:30]:
    print(f"  {name:<22} {val['total']}")
