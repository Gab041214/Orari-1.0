export type DayData = {
  start: string;
  end: string;
  total: string | null;
  late: boolean;
  shortShift: boolean;
} | null;

export function toMinutes(value: string): number | null {
  const m = value.match(/^(\d{1,2})[:.,]?(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Minuti -> "HH:MM", il formato richiesto dai campi orario. */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Ore nette di un turno: fine prima dell'inizio = oltre la mezzanotte; oltre 8h si toglie 1h di pausa. */
export function netMinutes(startMin: number, endMin: number): number {
  let diff = endMin - startMin;
  if (diff < 0) diff += 24 * 60;
  if (diff > 8 * 60) diff -= 60;
  return Math.max(diff, 0);
}

/** Costruisce il turno (con totale, "tardo" e "corto") a partire da inizio e fine. */
export function shiftFromTimes(start: string, end: string): DayData {
  const s = toMinutes(start);
  const e = toMinutes(end);
  let total: string | null = null;
  let shortShift = false;
  if (s !== null && e !== null) {
    const net = netMinutes(s, e);
    shortShift = net < 7 * 60;
    total = formatHours(net);
  }
  const late = e !== null && e >= 20 * 60;
  return { start, end, total, late, shortShift };
}
