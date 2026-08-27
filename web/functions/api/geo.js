/**
 * Эндпоинт /api/geo — координаты запроса из данных Cloudflare.
 *
 * Нужен для плашки автоопределения региона: браузерная геолокация требует
 * разрешения и всплывающего окна, а здесь ничего спрашивать не надо.
 * Точность региональная и не всегда верная — поэтому клиент только
 * ПРЕДЛАГАЕТ регион, а не переключает его сам.
 *
 * На зеркале GitHub Pages эндпоинта нет: клиент это переживает молча.
 */
export const onRequestGet = ({ request }) => {
  const cf = request.cf ?? {};
  const lat = Number(cf.latitude);
  const lon = Number(cf.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: "no geo" }), {
      status: 204,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ lat, lon, country: cf.country ?? null, region: cf.region ?? null }),
    {
      headers: {
        "content-type": "application/json",
        // Координаты грубые, но всё же о пользователе — в общий кэш не кладём.
        "cache-control": "private, max-age=3600",
      },
    },
  );
};
