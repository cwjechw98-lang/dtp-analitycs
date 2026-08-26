import { TILE_PROVIDERS } from "../lib/mapTiles";

/** Плавающие кнопки смены провайдера тайлов поверх карты. */
export default function TileSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-[600] flex gap-1 rounded-xl border border-slate-700/70 bg-slate-900/85 p-1 backdrop-blur">
      {TILE_PROVIDERS.map((p) => (
        <button
          key={p.id}
          title={`Провайдер карты: ${p.name}`}
          onClick={() => onChange(p.id)}
          className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
            value === p.id
              ? "bg-orange-500/30 text-orange-200 ring-1 ring-orange-400/60"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
