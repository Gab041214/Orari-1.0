import { format } from "date-fns";

/** Turno inserito a mano: `rest` = giorno senza turno. */
export type ShiftOverride = { rest: boolean; start: string; end: string };

/** mese (yyyy-MM) -> giorno (yyyy-MM-dd) -> nominativo -> turno modificato */
export type OverrideStore = Record<string, Record<string, Record<string, ShiftOverride>>>;

const OVERRIDES_KEY = "orari.overrides";

export const monthKey = (d: Date) => format(d, "yyyy-MM");
export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

export function loadOverrides(): OverrideStore {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as OverrideStore) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(store: OverrideStore) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function getOverride(
  store: OverrideStore,
  month: string,
  day: string,
  name: string,
): ShiftOverride | undefined {
  return store[month]?.[day]?.[name];
}

/** Restituisce un nuovo store con il turno impostato (o rimosso se `ov` è null). */
export function withOverride(
  store: OverrideStore,
  month: string,
  day: string,
  name: string,
  ov: ShiftOverride | null,
): OverrideStore {
  const next: OverrideStore = { ...store };
  const days = { ...(next[month] ?? {}) };
  const names = { ...(days[day] ?? {}) };
  if (ov) names[name] = ov;
  else delete names[name];
  if (Object.keys(names).length > 0) days[day] = names;
  else delete days[day];
  if (Object.keys(days).length > 0) next[month] = days;
  else delete next[month];
  return next;
}
