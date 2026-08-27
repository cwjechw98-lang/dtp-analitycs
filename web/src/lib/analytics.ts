/**
 * Минимальная аналитика без cookie и персональных данных.
 *
 * Нужна ровно для одного решения: подтверждается ли гипотеза, что основной
 * трафик приходит из пересланных ссылок, а не с лендинга. Без этих цифр
 * этап 4 пришлось бы делать вслепую.
 *
 * Считаем два числа: просмотры разделов и события «поделился». Ничего,
 * что позволяло бы узнать конкретного человека, не отправляем — маршрут
 * человека это его дело.
 */

const ENDPOINT = import.meta.env.VITE_ANALYTICS_URL ?? "";

type Payload = Record<string, string | number>;

function send(name: string, props: Payload = {}) {
  if (!ENDPOINT) return; // не настроено — молча ничего не делаем
  const body = JSON.stringify({ name, props, path: location.pathname, ref: document.referrer || null });
  try {
    // sendBeacon переживает уход со страницы, в отличие от fetch.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(ENDPOINT, { method: "POST", body, keepalive: true });
    }
  } catch {
    // аналитика не должна ломать приложение ни при каких условиях
  }
}

/** Просмотр раздела. Параметры URL не отправляем: там координаты маршрута. */
export function trackView(section: string) {
  send("view", { section });
}

/** Нажатие «поделиться» — ключевая метрика гипотезы. */
export function trackShare(kind: "route" | "fleet" | "me") {
  send("share", { kind });
}

/** Клик по кнопке благодарности — главная метрика этапа 5. */
export function trackTip() {
  send("tip_click");
}

/**
 * Переход по пересланной ссылке: определяем по наличию параметров,
 * которые сам пользователь руками не набирает.
 */
export function trackArrival() {
  const sp = new URLSearchParams(location.search);
  const fromShare = sp.has("n") || sp.has("vs") || (sp.has("a") && sp.has("b"));
  if (fromShare) send("arrival_from_share", { path: location.pathname });
}
