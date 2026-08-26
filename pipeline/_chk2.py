import json

d = json.load(open("../web/public/data/brands.json", encoding="utf-8"))
for b in ("TOYOTA", "KIA", "ВАЗ", "HYUNDAI", "VOLKSWAGEN", "BMW"):
    x = d["brands"].get(b)
    if not x:
        print(b, "нет")
        continue
    tops = ", ".join(f"{m}:{c}" for m, c, _ in x["models"][:4])
    print(f"{b}: total={x['total']} | {tops}")
