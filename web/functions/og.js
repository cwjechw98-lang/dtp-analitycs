import { ImageResponse } from "workers-og";

/**
 * /og — картинка 1200×630 для превью ссылки в мессенджерах.
 *
 * Воркер не имеет доступа к тому, что посчитал браузер, поэтому все числа
 * приходят в параметрах запроса (контракт §4). Ничего не выдумываем: если
 * параметра нет, поле просто не рисуется.
 *
 * Типы: kind=route | fleet | me
 */

const BG = "#070b14";
const ACCENT = "#f97316";
const MUTED = "#64748b";

const esc = (s) =>
  String(s ?? "")
    .slice(0, 120)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function shell(inner) {
  return `
    <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${BG};padding:64px;font-family:sans-serif;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="display:flex;width:12px;height:12px;border-radius:9999px;background:${ACCENT}"></div>
        <div style="display:flex;color:#e2e8f0;font-size:26px;font-weight:700;letter-spacing:-0.5px">ДТП Аналитика</div>
      </div>
      ${inner}
      <div style="display:flex;color:${MUTED};font-size:22px">
        Открытые данные ГИБДД · 1 602 164 ДТП · 85 регионов · 2015–2026
      </div>
    </div>`;
}

function routeCard(p) {
  const a = esc((p.get("a") ?? "").split(",")[2] || "Точка А");
  const b = esc((p.get("b") ?? "").split(",")[2] || "Точка Б");
  const n = Number(p.get("n"));
  return shell(`
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;color:#f1f5f9;font-size:64px;font-weight:800;letter-spacing:-2px">${a} → ${b}</div>
      ${
        Number.isFinite(n) && n > 0
          ? `<div style="display:flex;align-items:baseline;gap:16px">
               <div style="display:flex;color:${ACCENT};font-size:88px;font-weight:800">${n.toLocaleString("ru-RU")}</div>
               <div style="display:flex;color:#94a3b8;font-size:30px">ДТП в коридоре маршрута</div>
             </div>`
          : `<div style="display:flex;color:#94a3b8;font-size:30px">Статистика аварий вдоль маршрута</div>`
      }
    </div>`);
}

function fleetCard(p) {
  const brands = [p.get("brand"), ...(p.get("vs") ?? "").split(",")]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  if (brands.length < 2) {
    return shell(`
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;color:#f1f5f9;font-size:72px;font-weight:800">${esc(brands[0] ?? "Автопарк")}</div>
        <div style="display:flex;color:#94a3b8;font-size:30px">Виновники, тяжесть, регионы и нарушения по марке</div>
      </div>`);
  }
  return shell(`
    <div style="display:flex;flex-direction:column;gap:22px">
      <div style="display:flex;color:#94a3b8;font-size:30px">Кто чаще оказывается виновником</div>
      <div style="display:flex;align-items:center;gap:28px">
        ${brands
          .map(
            (b, i) =>
              `${i ? `<div style="display:flex;color:${MUTED};font-size:44px">×</div>` : ""}
               <div style="display:flex;color:#f1f5f9;font-size:64px;font-weight:800">${esc(b)}</div>`,
          )
          .join("")}
      </div>
    </div>`);
}

function meCard(p) {
  const exp = esc(p.get("expLabel") ?? "");
  const brand = esc(p.get("brand") ?? "");
  return shell(`
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;color:#f1f5f9;font-size:68px;font-weight:800">Мой профиль риска</div>
      <div style="display:flex;color:#94a3b8;font-size:30px">
        ${[exp && `стаж ${exp}`, brand].filter(Boolean).join(" · ") || "Стаж и марка против статистики по стране"}
      </div>
    </div>`);
}

export const onRequestGet = ({ request }) => {
  const p = new URL(request.url).searchParams;
  const kind = p.get("kind");
  const html = kind === "fleet" ? fleetCard(p) : kind === "me" ? meCard(p) : routeCard(p);

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    // Картинка полностью определяется параметрами, поэтому кэшируем надолго.
    headers: { "cache-control": "public, max-age=86400, s-maxage=604800" },
  });
};
