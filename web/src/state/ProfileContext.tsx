import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { EXP_BUCKETS } from "../lib/urlState";

/**
 * Профиль водителя (контракт §3).
 *
 * Три поля, ничего больше: форма из десяти полей не заполняется никогда.
 * Живёт только в браузере — на сервер не уходит ничего.
 */
export interface Profile {
  /** индекс бакета стажа 0…5, см. EXP_BUCKETS */
  exp: number | null;
  /** марка как в brands.json */
  brand: string | null;
  /** слаг домашнего региона */
  region: string | null;
}

const EMPTY: Profile = { exp: null, brand: null, region: null };

/** Версия в ключе: смена формы профиля не должна ломать старых пользователей. */
const STORAGE_KEY = "dtp.profile.v1";

function read(): Profile {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    const exp =
      typeof parsed.exp === "number" && parsed.exp >= 0 && parsed.exp < EXP_BUCKETS.length
        ? parsed.exp
        : null;
    return {
      exp,
      brand: typeof parsed.brand === "string" && parsed.brand ? parsed.brand : null,
      region: typeof parsed.region === "string" && parsed.region ? parsed.region : null,
    };
  } catch {
    // повреждённый localStorage не должен ронять приложение
    return EMPTY;
  }
}

interface ProfileApi {
  profile: Profile;
  /** заполнено ли хоть одно поле — по этому решаем, показывать ли приглашение */
  filled: boolean;
  set: (patch: Partial<Profile>) => void;
  clear: () => void;
}

const Ctx = createContext<ProfileApi | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(read);

  useEffect(() => {
    try {
      if (profile.exp == null && profile.brand == null && profile.region == null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      }
    } catch {
      // приватный режим / переполненное хранилище — молча продолжаем
    }
  }, [profile]);

  const set = useCallback((patch: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
  }, []);

  const clear = useCallback(() => setProfile(EMPTY), []);

  const filled = profile.exp != null || profile.brand != null || profile.region != null;

  return <Ctx.Provider value={{ profile, filled, set, clear }}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfile вне ProfileProvider");
  return v;
}

/**
 * Значение с учётом приоритета URL над сохранённым профилем.
 *
 * Открыв чужую ссылку `/me?exp=5`, человек видит чужие цифры,
 * но его собственный профиль остаётся нетронутым (контракт §3).
 */
export function resolveExp(urlExp: number | null, profile: Profile): number | null {
  return urlExp ?? profile.exp;
}

export function expLabel(idx: number | null): string {
  return idx == null ? "не указан" : `${EXP_BUCKETS[idx]} лет`;
}
