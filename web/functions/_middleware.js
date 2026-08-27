/**
 * Подстановка OG-тегов в index.html для конкретной ссылки.
 *
 * SPA отдаёт один и тот же HTML на все пути, поэтому мессенджер, разворачивая
 * ссылку, видел бы одну общую заглушку. Здесь мы переписываем теги на лету
 * по параметрам URL — это и есть та причина, по которой проект уехал с
 * GitHub Pages: там серверных функций нет.
 *
 * Краулеры не выполняют JS, так что важно именно серверное вмешательство.
 */

const SITE = "ДТП Аналитика";
const DEFAULT_DESC =
  "Статистика аварий России по открытым данным ГИБДД: маршруты, регионы, время и марки.";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Заголовок и описание под конкретный путь. Только из параметров, без выдумок. */
function meta(url) {
  const p = url.searchParams;
  const path = url.pathname.replace(/\/$/, "");

  if (path.endsWith("/route")) {
    const a = (p.get("a") ?? "").split(",")[2];
    const b = (p.get("b") ?? "").split(",")[2];
    const n = Number(p.get("n"));
    if (a && b) {
      return {
        title: `${a} → ${b} · ${SITE}`,
        desc: Number.isFinite(n) && n > 0
          ? `В коридоре маршрута ${n.toLocaleString("ru-RU")} ДТП по данным ГИБДД. Опасные участки и часы выезда.`
          : "Реальные ДТП вдоль маршрута, опасные участки и часы выезда.",
        og: `kind=route&${p.toString()}`,
      };
    }
  }

  if (path.endsWith("/fleet")) {
    const brands = [p.get("brand"), ...(p.get("vs") ?? "").split(",")]
      .map((x) => (x ?? "").trim())
      .filter(Boolean);
    if (brands.length > 1) {
      return {
        title: `${brands.join(" × ")} — кто чаще виноват · ${SITE}`,
        desc: "Сравнение марок по доле водителей-виновников в записях ГИБДД.",
        og: `kind=fleet&${p.toString()}`,
      };
    }
    if (brands.length === 1) {
      return {
        title: `${brands[0]} — статистика ДТП · ${SITE}`,
        desc: "Виновники, тяжесть, регионы и типичные нарушения по марке.",
        og: `kind=fleet&${p.toString()}`,
      };
    }
  }

  if (path.endsWith("/me")) {
    return {
      title: `Мой профиль риска · ${SITE}`,
      desc: "Стаж и марка против общероссийской статистики ГИБДД.",
      og: `kind=me&${p.toString()}`,
    };
  }

  return { title: SITE, desc: DEFAULT_DESC, og: "kind=route" };
}

class Head {
  constructor(m, url) {
    this.m = m;
    this.url = url;
  }
  element(el) {
    const img = `${this.url.origin}/og?${this.m.og}`;
    el.append(
      `<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(this.m.title)}">
<meta property="og:description" content="${esc(this.m.desc)}">
<meta property="og:url" content="${esc(this.url.href)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="${esc(this.m.desc)}">`,
      { html: true },
    );
  }
}

class Title {
  constructor(m) {
    this.m = m;
  }
  element(el) {
    el.setInnerContent(this.m.title);
  }
}

export const onRequest = async ({ request, next }) => {
  const url = new URL(request.url);

  // Ассеты и функции трогать незачем — переписываем только HTML-оболочку.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/og") || url.pathname.startsWith("/api/")) {
    return next();
  }

  const res = await next();
  if (!res.headers.get("content-type")?.includes("text/html")) return res;

  const m = meta(url);
  return new HTMLRewriter()
    .on("head", new Head(m, url))
    .on("title", new Title(m))
    .transform(res);
};
