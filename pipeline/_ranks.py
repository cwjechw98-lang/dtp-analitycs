import json

n = json.load(open("../web/public/data/national.json", encoding="utf-8"))
cb = n["culprits"]["brands"]
print("culprits.brands len:", len(cb))
print("Первые 5:", [(b["brand"], b["total"]) for b in cb[:5]])

d = json.load(open("../web/public/data/brands.json", encoding="utf-8"))
brands = d["brands"]
# отсортировать все марки по total
order = sorted(brands.items(), key=lambda x: -x[1]["total"])
print("Всего марок: ", len(order))
for name, val in order:
    u = name.upper()
    if any(k in u for k in ["HAVAL", "CHERY", "GEELY", "CHANGAN", "JAC", "GREAT", "BYD", "FAW", "OMODA", "EXEED", "TANK", "WULING", "GWM"]):
        idx = [i for i, (nm, _) in enumerate(order) if nm == name][0] + 1
        print("  ранг %3d  %-14s %s" % (idx, name, val["total"]))
