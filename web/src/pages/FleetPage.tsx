import FleetTab from "../components/FleetTab";

/**
 * Раздел «Автопарк».
 *
 * Единственный раздел, который уже был построен вокруг объекта, а не вокруг
 * измерения, поэтому переезжает как есть.
 * Этап 2: клик по региону в гео-охвате → /atlas?reg=&brand=
 * Этап 3: пермалинк на дуэль марок и OG-карточка.
 */
export default function FleetPage() {
  return <FleetTab />;
}
