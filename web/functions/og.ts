import { ImageResponse } from "workers-og";
import { compareBrands, verdict, noDifferenceText, plural } from "../src/lib/findings";
import type { BrandsFile } from "../src/lib/types";

/**
 * /og — картинка 1200×630 для превью ссылки в мессенджерах.
 *
 * Главное правило плана v3: сначала вердикт, потом данные. Первая версия
 * карточки показывала вопрос («кто чаще виноват») и два названия — то есть
 * ровно то, чего принцип запрещает. Теперь карточка несёт саму находку.
 *
 * Движок находок импортируется из src/lib — тот же код, что в приложении,
 * а не его копия. Расхождение между тем, что написано на карточке, и тем,
 * что человек увидит, перейдя по ссылке, недопустимо.
 *
 * Для маршрутов числа по-прежнему приходят в параметрах: коридор считает
 * браузер, воркер повторить этот расчёт не может.
 */

const BG = "#070b14";
const ACCENT = "#f97316";
const MUTED = "#64748b";

const esc = (s: unknown) =>
  String(s ?? "")
    .slice(0, 300)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Кегль подбирается под длину: вердикт бывает и в 60 знаков, и в 200,
 * а обрезать его многоточием — потерять смысл ровно там, где он и есть.
 */
function verdictSize(len: number): number {
  if (len < 90) return 52;
  if (len < 140) return 44;
  if (len < 190) return 38;
  return 32;
}

function shell(inner: string) {
  return `
    <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${BG};padding:60px 64px;font-family:sans-serif;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="display:flex;width:12px;height:12px;border-radius:9999px;background:${ACCENT}"></div>
        <div style="display:flex;color:#e2e8f0;font-size:24px;font-weight:700;letter-spacing:-0.5px">ДТП Аналитика</div>
      </div>
      ${inner}
      <div style="display:flex;color:${MUTED};font-size:20px">
        Открытые данные ГИБДД · 1 602 164 ДТП · 85 регионов · 2015–2026
      </div>
    </div>`;
}

/** Карточка с вердиктом: сам вывод крупно, сравниваемые объекты подписью. */
function verdictCard(subject: string, text: string, sample?: string) {
  const size = verdictSize(text.length);
  return shell(`
    <div style="display:flex;flex-direction:column;gap:20px">
      <div style="display:flex;color:${ACCENT};font-size:26px;font-weight:600;letter-spacing:0.5px">${esc(subject)}</div>
      <div style="display:flex;color:#f1f5f9;font-size:${size}px;font-weight:800;line-height:1.25;letter-spacing:-1px">${esc(text)}</div>
      ${sample ? `<div style="display:flex;color:#94a3b8;font-size:22px">${esc(sample)}</div>` : ""}
    </div>`);
}

async function fleetCard(p: URLSearchParams, origin: string) {
  const brands = [p.get("brand"), ...(p.get("vs") ?? "").split(",")]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);

  if (brands.length < 2) {
    return verdictCard(
      brands[0] ?? "Автопарк",
      brands[0]
        ? `Виновники, тяжесть, регионы и нарушения по марке ${brands[0]}`
        : "Сравнение марок по данным ГИБДД",
    );
  }

  try {
    const res = await fetch(`${origin}/data/brands.json`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as BrandsFile;

    const key = (want: string) =>
      Object.keys(file.brands).find((k) => k.toUpperCase() === want.toUpperCase());
    const ka = key(brands[0]);
    const kb = key(brands[1]);
    if (!ka || !kb) throw new Error("brand not found");

    const found = compareBrands({
      nameA: ka,
      a: file.brands[ka],
      nameB: kb,
      b: file.brands[kb],
    });
    const v = verdict(found);
    const subject = `${ka} × ${kb}`;

    if (!v) return verdictCard(subject, noDifferenceText(ka, kb));
    const more = found.length - 1;
    return verdictCard(
      subject,
      v.text,
      more > 0
        ? `и ещё ${more} ${plural(more, "заметное отличие", "заметных отличия", "заметных отличий")} в данных`
        : undefined,
    );
  } catch {
    // Данные не доехали — отдаём карточку без вердикта, но не пустую
    // и без выдуманных чисел.
    return verdictCard(brands.slice(0, 2).join(" × "), "Сравнение марок по данным ГИБДД");
  }
}

function routeCard(p: URLSearchParams) {
  const a = (p.get("a") ?? "").split(",")[2] || "Точка А";
  const b = (p.get("b") ?? "").split(",")[2] || "Точка Б";
  const n = Number(p.get("n"));
  if (Number.isFinite(n) && n > 0) {
    return verdictCard(
      `${a} → ${b}`,
      `${n.toLocaleString("ru-RU")} ДТП вдоль этого маршрута с 2015 года`,
      "опасные участки, часы выезда и карточки происшествий",
    );
  }
  return verdictCard(`${a} → ${b}`, "Статистика аварий вдоль маршрута");
}

function meCard(p: URLSearchParams) {
  const exp = p.get("expLabel") ?? "";
  const brand = p.get("brand") ?? "";
  const bits = [exp && `стаж ${exp}`, brand].filter(Boolean).join(" · ");
  return verdictCard(
    "Профиль риска",
    "Мой стаж и марка против статистики по стране",
    bits || undefined,
  );
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const p = url.searchParams;
  const kind = p.get("kind");

  const html =
    kind === "fleet"
      ? await fleetCard(p, url.origin)
      : kind === "me"
        ? meCard(p)
        : routeCard(p);

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: { "cache-control": "public, max-age=86400, s-maxage=604800" },
  });
};
