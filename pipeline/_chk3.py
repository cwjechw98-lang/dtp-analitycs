import ijson

f = open("../data/raw/moskva.geojson", "rb")
shown = 0
for feat in ijson.items(f, "features.item"):
    vehs = (feat.get("properties") or {}).get("vehicles") or []
    if len(vehs) >= 1:
        pairs = [(v.get("brand"), v.get("model")) for v in vehs[:3]]
        print(pairs)
        shown += 1
    if shown >= 12:
        break
