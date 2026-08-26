/** Живой фон: медленно дрейфующие градиентные пятна + сетка. */
export default function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#070b14]" />
      <div className="blob absolute -top-40 left-[8%] h-[34rem] w-[34rem] rounded-full bg-orange-600/14 blur-[110px]" />
      <div className="blob blob-slow absolute top-[30%] right-[-10%] h-[38rem] w-[38rem] rounded-full bg-sky-500/12 blur-[120px]" />
      <div className="blob blob-alt absolute bottom-[-15%] left-[25%] h-[32rem] w-[32rem] rounded-full bg-violet-600/12 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black 55%, transparent 100%)",
        }}
      />
    </div>
  );
}
