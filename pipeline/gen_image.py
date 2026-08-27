#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генерация иллюстраций через Pollinations.ai (безлимитно, без ключа)
с опцией Cloudflare Workers AI (бесплатно, но лимит нейронов/день).

Использование:  python pipeline/gen_image.py "промпт" [--out имя] [--provider pollinations|cloudflare] [--model MODEL]
Примеры:
  python pipeline/gen_image.py "синие горы на закате, цифровая живопись" --out docs/screenshots/hills.jpg
  python pipeline/gen_image.py "белый внедорожник в лесу" --model flux-realism
  python pipeline/gen_image.py "неоновая автомагистраль ночью" --provider cloudflare

Pollinations:  бесплатно и без лимитов, ключ не нужен (анонимно). НО это
  «нестабильная» бесплатная модель: стиль часто игнорируется, а марки
  вроде ВАЗ/Лада вообще не воспроизводятся. Годится только для экспериментов
  и декора, НЕ для генерации на сайте по запросу посетителя.
  У Pollinations есть и платный ключ / API-токен с бОльшими лимитами и
  более точными моделями (см. PREMIUM_MODELS) — применять в личных целях,
  не в проде.
Cloudflare:    выберите --provider cloudflare, у него дневной лимит нейронов (429 -> подождите).

ВАЖНО (решение проекта): на сайте НЕ использовать генерацию картинок по
  запросу пользователя — проект бесплатный (донаты за кофе), лимиты и
  ненадёжность бесплатных моделей делают это экономически нецелесообразным.
  Для публичных элементов — только готовые SVG/иконки и шаблоны, собранные из
  данных. Этот скрипт — инструмент для экспериментов и памяти о доступной
  бесплатной генерации (Pollinations как запасной вариант).
"""
import argparse, base64, json, os, sys, urllib.request, urllib.error
from urllib.parse import quote

# --- конфигурация Cloudflare (нужна только для --provider cloudflare) ---
# СЕКРЕТЫ не захардкожены: берутся из переменных окружения и задаются локально.
# Для Cloudflare-генерации задайте их в shell перед запуском:
#   $env:CLOUDFLARE_ACCOUNT_ID="..."
#   $env:CLOUDFLARE_API_TOKEN="..."
ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
API_TOKEN  = os.environ.get("CLOUDFLARE_API_TOKEN", "")

# Стили/модели Pollinations (передаются как ?model=...)
POLLINATIONS_MODELS = ["flux", "flux-realism", "flux-anime", "flux-3d", "turbo"]

# Модели Cloudflare (проверенно-рабочие)
CF_MODELS = {
    "flux":    "@cf/black-forest-labs/flux-1-schnell",
    "phoenix": "@cf/leonardo/phoenix-1.0",
    "lucid":   "@cf/leonardo/lucid-origin",
    "dream":   "@cf/lykon/dreamshaper-8-lcm",
    "sdxl":    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
}


def gen_pollinations(prompt: str, model: str = "flux", width: int = 1024, height: int = 1024) -> bytes:
    """Pollinations: простой HTTPS-GET, без ключа и лимита."""
    url = ("https://image.pollinations.ai/prompt/" + quote(prompt) +
           f"?width={width}&height={height}&nologo=true&model={model}")
    req = urllib.request.Request(url, headers={"User-Agent": "dtp-analitycs/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Pollinations HTTP {e.code}: {e.read(160).decode('utf-8','replace')}")


def gen_cloudflare(model: str, prompt: str, steps: int = 8) -> bytes:
    """Cloudflare Workers AI: POST JSON, лимит нейронов/день (429)."""
    if not ACCOUNT_ID or not API_TOKEN:
        raise SystemExit("Cloudflare: задайте CLOUDFLARE_ACCOUNT_ID и CLOUDFLARE_API_TOKEN в переменных окружения, "
                         "либо используйте --provider pollinations (без ключа).")
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{CF_MODELS[model]}"
    body = json.dumps({"prompt": prompt, "steps": steps}).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Authorization": f"Bearer {API_TOKEN}",
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise SystemExit("429: дневной лимит нейронов Cloudflare исчерпан — подождите или используйте Pollinations.")
        raise SystemExit(f"Cloudflare HTTP {e.code}: {e.read(160).decode('utf-8','replace')}")
    if data[:4] != b"\x89PNG" and data[:2] != b"\xff\xd8" and data[:4] != b"RIFF":
        try:
            j = json.loads(data)
            if "result" in j and isinstance(j["result"], dict) and "image" in j["result"]:
                return base64.b64decode(j["result"]["image"])
        except Exception:
            pass
    return data


def guess_ext(data: bytes) -> str:
    if data[:2] == b"\xff\xd8":
        return ".jpg"
    if data[:4] == b"RIFF":
        return ".webp"
    return ".png"


def main() -> None:
    ap = argparse.ArgumentParser(description="Генерация иллюстраций (Pollinations/Cloudflare)")
    ap.add_argument("prompt", help="текстовое описание картинки")
    ap.add_argument("--out", default=None, help="путь сохранения, напр. docs/screenshots/img.jpg")
    ap.add_argument("--provider", default="pollinations", choices=["pollinations", "cloudflare"],
                    help="провайдер: pollinations (безлимит) или cloudflare (лимит/день)")
    ap.add_argument("--model", default=None, help="модель/стиль, напр. flux, flux-realism, phoenix")
    ap.add_argument("--size", default="1024x1024", help="размер WxH (только для pollinations)")
    ap.add_argument("--steps", type=int, default=8, help="шаги (только для cloudflare)")
    args = ap.parse_args()

    if args.provider == "cloudflare":
        model = args.model or "flux"
        data = gen_cloudflare(model, args.prompt, args.steps)
        ext = guess_ext(data)
    else:
        model = args.model or "flux"
        w, h = (int(x) for x in args.size.lower().split("x"))
        data = gen_pollinations(args.prompt, model, w, h)
        ext = guess_ext(data)

    out = args.out or f"ai-image{ext}"
    base, have_ext = os.path.splitext(out)
    if have_ext.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
        out = base + ext
    os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
    with open(out, "wb") as f:
        f.write(data)
    print(f"OK [{args.provider}/{model}] -> {out} ({len(data)} байт)")


if __name__ == "__main__":
    main()
