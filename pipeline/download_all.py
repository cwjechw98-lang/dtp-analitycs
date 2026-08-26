"""Параллельное скачивание выгрузок ВСЕХ регионов с dtp-stat.ru/opendata.

Использование:
    py download_all.py [--workers 6]
Результат:
    ../data/raw/<slug>.geojson   — распакованные данные каждого региона
    ../data/raw/manifest.json    — манифест (размеры, время скачивания)
"""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.request
import zipfile

PAGE = "https://dtp-stat.ru/opendata/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
UA = {"User-Agent": "dtp-analitycs-pipeline/2.0"}

_slug_re = re.compile(r"/media/opendata/([a-z0-9\-]+)\.geojson\.zip")


def fetch(url: str, timeout: int = 300) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def list_slugs() -> list[str]:
    html = fetch(PAGE).decode("utf-8", "ignore")
    slugs = sorted(set(_slug_re.findall(html)))
    if len(slugs) < 10:
        raise RuntimeError(f"Со страницы получено всего {len(slugs)} регионов — схема сайта изменилась?")
    return slugs


def download_one(slug: str) -> tuple[str, str, int]:
    dest = RAW / f"{slug}.geojson"
    if dest.exists() and dest.stat().st_size > 1000:
        return slug, "cached", dest.stat().st_size
    zp = RAW / f"{slug}.zip"
    for attempt in range(3):
        try:
            data = fetch(f"https://dtp-stat.ru/media/opendata/{slug}.geojson.zip")
            zp.write_bytes(data)
            with zipfile.ZipFile(zp) as zf:
                name = next(n for n in zf.namelist() if n.endswith(".geojson"))
                zf.extract(name, RAW)
                if name != f"{slug}.geojson":
                    (RAW / name).replace(dest)
            zp.unlink(missing_ok=True)
            return slug, "ok", dest.stat().st_size
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                return slug, f"FAILED: {e}", 0
            zp.unlink(missing_ok=True)
    return slug, "FAILED", 0


def main() -> int:
    workers = 6
    if "--workers" in sys.argv:
        workers = int(sys.argv[sys.argv.index("--workers") + 1])
    RAW.mkdir(parents=True, exist_ok=True)

    slugs = list_slugs()
    print(f"Регионов на источнике: {len(slugs)}", flush=True)

    manifest_path = RAW / "manifest.json"
    manifest: dict[str, dict] = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    done = 0
    failed: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(download_one, s): s for s in slugs}
        for fut in concurrent.futures.as_completed(futures):
            slug, status, size = fut.result()
            done += 1
            manifest[slug] = {
                "size_bytes": size,
                "status": status,
                "downloaded_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
            mark = "OK " if status in ("ok", "cached") else "!!!"
            print(f"[{done:>3}/{len(slugs)}] {mark} {slug}: {status}, {size / 1e6:.1f} МБ", flush=True)
            if status.startswith("FAILED"):
                failed.append(slug)

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    total_mb = sum(m["size_bytes"] for m in manifest.values()) / 1e6
    print(f"\nГотово: {len(slugs) - len(failed)}/{len(slugs)} регионов, всего {total_mb:.0f} МБ", flush=True)
    if failed:
        print("Не удалось скачать:", ", ".join(failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
