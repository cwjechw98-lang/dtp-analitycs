"""Скачивание свежей выгрузки ДТП Омской области с dtp-stat.ru/opendata.

Использование:
    py download.py
Результат:
    ../data/raw/omskaia-oblast.geojson        — распакованные исходные данные
    ../data/raw/download_meta.json            — метаданные выгрузки (для meta.json)
"""
from __future__ import annotations

import json
import pathlib
import sys
import urllib.request
import zipfile

SOURCE_URL = "https://dtp-stat.ru/media/opendata/omskaia-oblast.geojson.zip"
PAGE_URL = "https://dtp-stat.ru/opendata/"

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"


def main() -> int:
    import datetime as dt

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = RAW_DIR / "omskaia-oblast.geojson.zip"
    started = dt.datetime.now(dt.timezone.utc)

    print(f"[1/3] Скачиваем {SOURCE_URL}")
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "dtp-analitycs-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        with open(zip_path, "wb") as fh:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                fh.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r      {done / 1e6:7.1f} / {total / 1e6:.1f} МБ", end="", flush=True)
    print()

    print("[2/3] Распаковка...")
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        geo_name = next((n for n in names if n.endswith(".geojson")), None)
        if geo_name is None:
            print(f"ОШИБКА: в архиве нет .geojson файла ({names})", file=sys.stderr)
            return 1
        zf.extract(geo_name, RAW_DIR)
    out_geo = RAW_DIR / geo_name

    meta = {
        "source_url": SOURCE_URL,
        "opendata_page": PAGE_URL,
        "region": "Омская область",
        "downloaded_at_utc": started.isoformat(),
        "raw_size_bytes": out_geo.stat().st_size,
    }
    (RAW_DIR / "download_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"[3/3] OK: {out_geo.name} ({meta['raw_size_bytes'] / 1e6:.1f} МБ)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
