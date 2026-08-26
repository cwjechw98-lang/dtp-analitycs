import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "dark" | "light";
export type AccentId = "fire" | "ocean" | "forest" | "magenta";

export const ACCENTS: Record<AccentId, { name: string; main: string; soft: string; blobs: [string, string, string] }> = {
  fire: { name: "Огонь", main: "#f97316", soft: "#fb923c", blobs: ["rgba(234,88,12,0.16)", "rgba(56,189,248,0.12)", "rgba(139,92,246,0.13)"] },
  ocean: { name: "Океан", main: "#38bdf8", soft: "#7dd3fc", blobs: ["rgba(14,165,233,0.17)", "rgba(99,102,241,0.15)", "rgba(6,182,212,0.13)"] },
  forest: { name: "Лес", main: "#34d399", soft: "#6ee7b7", blobs: ["rgba(16,185,129,0.15)", "rgba(20,184,166,0.13)", "rgba(132,204,22,0.11)"] },
  magenta: { name: "Магента", main: "#e879f9", soft: "#f5d0fe", blobs: ["rgba(217,70,239,0.14)", "rgba(168,85,247,0.14)", "rgba(244,63,94,0.11)"] },
};

interface ThemeCtx {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  accent: AccentId;
  setAccent: (a: AccentId) => void;
  accentMain: string;
  accentSoft: string;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("ThemeProvider missing");
  return v;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() =>
    (localStorage.getItem("dtp_theme") as ThemeMode) || "dark",
  );
  const [accent, setAccent] = useState<AccentId>(() =>
    (localStorage.getItem("dtp_accent") as AccentId) || "fire",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem("dtp_theme", mode);
  }, [mode]);

  useEffect(() => {
    if (ACCENTS[accent]) {
      document.documentElement.dataset.accent = accent;
      localStorage.setItem("dtp_accent", accent);
    }
  }, [accent]);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      setMode,
      accent,
      setAccent,
      accentMain: ACCENTS[accent]?.main ?? ACCENTS.fire.main,
      accentSoft: ACCENTS[accent]?.soft ?? ACCENTS.fire.soft,
    }),
    [mode, accent],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
