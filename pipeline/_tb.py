import json

n = json.load(open("../web/public/data/national.json", encoding="utf-8"))
tb = n["vehicles"]["top_brands"]
print("top_brands len:", len(tb))
for i, b in enumerate(tb[:30]):
    print("  %2d. %-20s %s" % (i + 1, b["name"], b["count"]))
