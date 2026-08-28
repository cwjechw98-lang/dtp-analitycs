/**
 * Минимальный SEO-хелпер для SPA: динамические title/description per-страница.
 * Без внешних зависимостей. Для полноценной индексации нужна пререндер-версия
 * (этот хелпер помогает мессенджерам/вкладкам и частично — поиску).
 */
function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

function setProp(prop: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute("property", prop); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

export function useSeo(title: string, description?: string) {
  if (typeof document === "undefined") return;
  document.title = title;
  if (description) {
    setMeta("description", description);
    setProp("og:title", title);
    setProp("og:description", description);
  }
}
