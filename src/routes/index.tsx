import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Upload, Trash2, Users, Keyboard, Plus, ChevronDown, Check, Sun, Moon, Monitor, Settings } from "lucide-react";
import { format, addDays, isToday, startOfMonth, endOfMonth, startOfWeek, differenceInCalendarWeeks, differenceInCalendarDays } from "date-fns";
import { it } from "date-fns/locale";

import { Button } from "@/components/ui/button";


import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useThemePref, type ThemePref } from "@/lib/theme";
import { DayEditPanels } from "@/components/shift-editor";
import {
  dayKey,
  getOverride,
  hasShiftOverride,
  loadOverrides,
  monthKey,
  saveOverrides,
  updateOverride,
  type DayOverride,
  type OverrideStore,
} from "@/lib/overrides";
import { overallTimes, shiftFromTimes, shiftWithOvertime, toMinutes, type DayData, type Overtime } from "@/lib/shifts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orari 1.0 — Turni e ore lavorate da Excel" },
      {
        name: "description",
        content:
          "Carica il file Excel dei turni, scegli la domenica di riferimento e consulta orari e ore lavorate in un calendario in stile iOS, anche offline.",
      },
      { property: "og:title", content: "Orari 1.0 — Turni e ore lavorate da Excel" },
      {
        property: "og:description",
        content:
          "Carica il file Excel dei turni, scegli la domenica di riferimento e consulta orari e ore lavorate in un calendario in stile iOS, anche offline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STORAGE_KEY = "turni.voci";
const FILE_CACHE_NAME = "turni-file";
// Sessione persistente: file caricato + selezioni, ripristinati alla riapertura
const ROWS_KEY = "turni.file.rows";
const FILENAME_KEY = "turni.file.name";
const SELECTED_KEY = "turni.selected";
const MONTH_KEY = "turni.month";
const FILE_SUNDAY_KEY = "turni.fileSunday";
// Indice della coppia di colori scelta (vedi ACCENT_PAIRS); vale per entrambi i temi.
const ACCENT_KEY = "turni.accentIndex";

const THEME_OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Auto", Icon: Monitor },
  { value: "light", label: "Chiaro", Icon: Sun },
  { value: "dark", label: "Scuro", Icon: Moon },
];

/**
 * Colori d'accento per badge ore e barre del popup: cinque coppie "agganciate" al tema.
 * Si salva solo quale coppia è scelta; il colore mostrato dipende dal tema attivo
 * (light = tema chiaro, dark = tema scuro).
 */
const ACCENT_PAIRS: { light: string; dark: string }[] = [
  { light: "#00701F", dark: "#6CBD00" },
  { light: "#007499", dark: "#52B3AD" },
  { light: "#0055B6", dark: "#4496FF" },
  { light: "#900006", dark: "#EF3C2C" },
  { light: "#FEC200", dark: "#F6DC7D" },
];

/**
 * Svuota la cache offline dei dati del file precedente.
 * Non tocca MAI l'elenco voci (STORAGE_KEY): quello si cancella solo dall'utente.
 */
async function clearPreviousFileCache() {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      const keys = Object.keys(storage).filter(
        (k) => k.startsWith("turni.file") && k !== STORAGE_KEY,
      );
      keys.forEach((k) => storage.removeItem(k));
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") {
      await caches.delete(FILE_CACHE_NAME);
    }
  } catch {
    /* ignore */
  }
}

const DAY_LABELS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
// 1-based CSV column numbers per day (Mon..Sun)
const DAY_BLOCKS: number[][] = [
  [8, 9, 10, 11],
  [13, 14, 15, 16],
  [18, 19, 20, 21],
  [23, 24, 25, 26],
  [28, 29, 30, 31],
  [33, 34, 35, 36],
  [3, 4, 5, 6],
];

const TARGET_TABLE = "inserimento orari";

const MONTH_NAMES = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** Estrae mese e anno di riferimento dal nome del file (es. "Turni Ottobre 2026.xlsx"). */
function monthYearFromFileName(name: string | null): Date | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  const monthIdx = MONTH_NAMES.findIndex((m) => lower.includes(m));
  if (monthIdx === -1) return undefined;

  const yearMatch = lower.match(/(19|20)\d{2}/) ?? lower.match(/\b\d{2}\b/);
  let year = new Date().getFullYear();
  if (yearMatch) {
    const raw = yearMatch[0];
    year = raw.length === 2 ? 2000 + Number(raw) : Number(raw);
  }
  return new Date(year, monthIdx, 1);
}

function norm(v: string): string {
  return v.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Estrae la data esatta dalla cella E7 del foglio "SETUP": è la domenica della prima settimana. */
function setupSunday(XLSX: typeof import("xlsx"), wb: import("xlsx").WorkBook): Date | undefined {
  const name = wb.SheetNames.find((n) => norm(n) === "setup");
  if (!name) return undefined;
  const cell = wb.Sheets[name]?.["E7"];
  if (!cell) return undefined;
  if (cell.v instanceof Date) return cell.v;
  if (typeof cell.v === "number") {
    const p = XLSX.SSF.parse_date_code(cell.v);
    if (p) return new Date(p.y, p.m - 1, p.d);
  }
  const s = String(cell.w ?? cell.v ?? "").trim();
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const year = Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1]));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Legge la sola tabella "Inserimento Orari" dal file Excel. */
async function parseExcel(
  file: File,
): Promise<{ rows: string[][]; month: Date | undefined; fileSunday: Date | undefined }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  // Domenica esatta della prima settimana, letta da SETUP!E7 (es. 30/08 per un file di settembre).
  const fileSunday = setupSunday(XLSX, wb);
  // Priorità al mese/anno nel nome del file; fallback sul lunedì successivo a fileSunday.
  const month = monthYearFromFileName(file.name) ?? (fileSunday ? startOfMonth(addDays(fileSunday, 1)) : undefined);

  const toRows = (name: string): string[][] =>
    (
      XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      }) as unknown[][]
    ).map((r) => r.map((c) => String(c ?? "").trim()));

  // 1) foglio chiamato "Inserimento Orari"
  const sheetName = wb.SheetNames.find((n) => norm(n) === TARGET_TABLE);
  if (sheetName) return { rows: toRows(sheetName).filter((r) => r.some((c) => c !== "")), month, fileSunday };

  // 2) tabella identificata da una cella "Inserimento Orari": prendi le righe sotto
  for (const name of wb.SheetNames) {
    const rows = toRows(name);
    const idx = rows.findIndex((r) => r.some((c) => norm(c) === TARGET_TABLE));
    if (idx !== -1) {
      return { rows: rows.slice(idx + 1).filter((r) => r.some((c) => c !== "")), month, fileSunday };
    }
  }

  return { rows: [], month, fileSunday };
}


/** Restituisce nero o bianco per il massimo contrasto rispetto al colore esadecimale dato. */
type ShiftEntry = { name: string; startLabel: string; endLabel: string; startMin: number; endMin: number; modified: boolean };

const BASE_RANGE_START = 10 * 60;
const BASE_RANGE_END = 20 * 60;

/**
 * Calcola posizione e larghezza (in %) del tratto colorato di un turno, sul range
 * [rangeStart, rangeEnd] passato da chi chiama: di norma 10:00-20:00, ma esteso quando
 * quel giorno ci sono turni fuori da questi orari (es. venerdì/sabato fino alle 20:30).
 */
function barMetrics(
  startMin: number,
  endMin: number,
  rangeStart: number = BASE_RANGE_START,
  rangeEnd: number = BASE_RANGE_END,
): { left: number; width: number } {
  const span = rangeEnd - rangeStart;
  const clamp = (v: number) => Math.min(Math.max(v, rangeStart), rangeEnd);
  const left = ((clamp(startMin) - rangeStart) / span) * 100;
  const right = ((clamp(endMin) - rangeStart) / span) * 100;
  return { left, width: Math.max(right - left, 3) };
}

function contrastTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

type WeekData = { monday: Date | undefined; days: DayData[]; mods: boolean[]; files: DayData[] };

/**
 * Confronta il nominativo del calendario con il valore della cella Excel in modo
 * tollerante: normalizza entrambi (minuscolo, spazi multipli ridotti) e considera
 * corrispondenza anche se uno dei due è contenuto nell'altro — così "Rossi" trova
 * una cella "Mario Rossi", e viceversa.
 */
function nameMatches(cellValue: string, selected: string): boolean {
  const cell = norm(cellValue);
  const sel = norm(selected);
  if (!sel || !cell) return false;
  return cell === sel || cell.includes(sel) || sel.includes(cell);
}

/**
 * Distingue un nominativo vero da tutto il resto che compare nella colonna B
 * (intestazioni, etichette "Settimana N", testo del template, celle vuote/numeriche):
 * i nomi veri sono scritti "Nome Proprio" (iniziale maiuscola, resto minuscolo),
 * mentre le etichette da scartare sono o tutte in MAIUSCOLO o senza lettere.
 */
function looksLikeRealName(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (!/[a-zà-ÿ]/i.test(v)) return false; // nessuna lettera (es. "0")
  if (/^settimana(\s*\d+)?$/i.test(v)) return false; // "Settimana", "Settimana 1", "Settimana 2"...
  if (v === v.toUpperCase()) return false; // tutto maiuscolo = intestazione/ruolo, non un nome
  return true;
}

/** Ricostruisce la mappa offset -> turno (Sunday=0, Mon..Sat=1..6, poi +7 per ogni riga) per un nominativo. */
function offsetMapForName(rows: string[][], name: string): Map<number, DayData> {
  const matching = rows.filter((r) => nameMatches(r[1] ?? "", name));
  const byOffset = new Map<number, DayData>();
  matching.forEach((row, i) => {
    const base = i * 7;
    byOffset.set(base, blockData(row, DAY_BLOCKS[6]!));
    for (let d = 0; d < 6; d++) {
      byOffset.set(base + 1 + d, blockData(row, DAY_BLOCKS[d]!));
    }
  });
  return byOffset;
}

/**
 * Applica le modifiche manuali al turno del file: prima l'orario ordinario inserito a mano
 * (nessun turno se "a riposo"), poi l'eventuale straordinario agganciato all'ordinario.
 * Con `withOvertime = false` restituisce solo l'ordinario.
 */
function applyOverride(base: DayData, ov: DayOverride | undefined, withOvertime = true): DayData {
  if (!ov) return base;
  let data = base;
  if (hasShiftOverride(ov)) data = ov.rest ? null : shiftFromTimes(ov.start ?? "", ov.end ?? "");
  return withOvertime ? shiftWithOvertime(data, ov.ot) : data;
}

function blockData(row: string[], cols: number[]): DayData {
  const values: string[] = [];
  for (const c of cols) {
    const v = (row[c - 1] ?? "").trim();
    if (v !== "") values.push(v);
  }
  if (values.length === 0) return null;
  return shiftFromTimes(values[0] ?? "", values[values.length - 1] ?? "");
}

const SWIPE_ACTIONS_WIDTH = 80; // 2 pulsanti da 36px + gap 8px, allineati al bordo destro

/** Riga voce con swipe da destra verso sinistra: rivela modifica (blu) ed elimina (rosso). Tocco semplice = seleziona. */
function EntryRow({
  name,
  selected,
  onSelect,
  onDelete,
  onRename,
}: {
  name: string;
  selected?: boolean;
  onSelect?: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
}) {
  const [reveal, setReveal] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const startX = useRef(0);
  const startReveal = useRef(0);
  const moved = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (editing) return;
    setDragging(true);
    moved.current = false;
    startX.current = e.clientX;
    startReveal.current = reveal;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const delta = startX.current - e.clientX;
    if (Math.abs(delta) > 4) moved.current = true;
    setReveal(Math.min(SWIPE_ACTIONS_WIDTH, Math.max(0, startReveal.current + delta)));
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (!moved.current) {
      // Tocco semplice (nessun trascinamento reale): se era chiusa, seleziona; se era aperta, richiudi.
      if (reveal === 0) onSelect?.();
      else setReveal(0);
      return;
    }
    setReveal((current) => (current > SWIPE_ACTIONS_WIDTH / 2 ? SWIPE_ACTIONS_WIDTH : 0));
  };

  const confirmRename = () => {
    const v = draft.trim();
    if (v && v !== name) onRename(v);
    setEditing(false);
  };

  return (
    <li className="relative h-11 shrink-0 overflow-hidden rounded-xl">
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end gap-1 pl-1"
        style={{ width: SWIPE_ACTIONS_WIDTH }}
      >
        <button
          type="button"
          aria-label={`Modifica ${name}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#0A84FF] text-white"
          onClick={() => {
            setDraft(name);
            setEditing(true);
            setReveal(0);
          }}
        >
          <Keyboard className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label={`Elimina ${name}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FF3B30] text-white"
          onClick={onDelete}
        >
          <Trash2 className="size-[18px]" />
        </button>
      </div>
      <div
        className={cn(
          "relative flex h-11 touch-pan-y cursor-pointer items-center overflow-hidden rounded-xl bg-secondary px-3",
          selected && "ring-2 ring-inset ring-foreground/70",
        )}
        style={{
          width: `calc(100% - ${reveal}px)`,
          transition: dragging ? "none" : "width 0.2s ease",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename();
              else if (e.key === "Escape") setEditing(false);
            }}
            onBlur={confirmRename}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-[16px] text-foreground outline-none"
          />
        ) : (
          <>
            <span className="flex-1 truncate text-sm text-foreground">{name}</span>
            {selected && <Check className="size-4 shrink-0 text-foreground" />}
          </>
        )}
      </div>
    </li>
  );
}

/** Riga del popup: nominativo, orari e barra; con il pallino se il turno è stato modificato a mano. */
function ShiftRow({
  entry,
  range,
  accent,
}: {
  entry: ShiftEntry;
  range: { start: number; end: number };
  accent: string;
}) {
  const { left, width } = barMetrics(entry.startMin, entry.endMin, range.start, range.end);
  return (
    <li
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground"
      style={{ backgroundColor: "var(--app-chip)" }}
    >
      <span className="flex-1 truncate">{entry.name}</span>
      {entry.modified && (
        <span
          role="img"
          aria-label="Turno modificato"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
      )}
      <span className="text-[10px] text-muted-foreground">{entry.startLabel}</span>
      <div className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: "var(--app-track)" }}>
        <div
          className="absolute inset-y-0 rounded-full"
          style={{ left: `${left}%`, width: `${width}%`, backgroundColor: accent }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">{entry.endLabel}</span>
    </li>
  );
}

function Index() {
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [month, setMonth] = useState<Date | undefined>(undefined);
  const [fileSunday, setFileSunday] = useState<Date | undefined>(undefined);
  const [selected, setSelected] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" })),
    [options],
  );
  const [namesOpen, setNamesOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [popupDate, setPopupDate] = useState<Date | null>(null);
  // Tessera di cui è aperto il riquadro "Turno originale" (toccando il pallino): "settimana-giorno".
  const [peekKey, setPeekKey] = useState<string | null>(null);
  // Turni modificati a mano (per mese del file, giorno e nominativo); restano solo su questo dispositivo.
  const [overrides, setOverrides] = useState<OverrideStore>({});
  const [newOption, setNewOption] = useState("");
  // Nominativi suggeriti dall'ultimo file caricato ma non ancora in elenco; "Ignora" li nasconde
  // finché non si carica un nuovo file (vedi reset in handleFile).
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [accentIdx, setAccentIdx] = useState(0);
  const setAccentIndex = (i: number) => {
    setAccentIdx(i);
    try {
      localStorage.setItem(ACCENT_KEY, String(i));
    } catch {
      /* ignore */
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [themePref, setThemePref, isDark] = useThemePref();
  // Colore d'accento effettivo: la coppia scelta, nella variante del tema attivo.
  const accentPair = ACCENT_PAIRS[accentIdx] ?? ACCENT_PAIRS[0]!;
  const accent = isDark ? accentPair.dark : accentPair.light;

  // Blocca lo scroll della pagina sottostante mentre il menu nomi è aperto: il Popover, a
  // differenza del Dialog, non lo fa in automatico, quindi senza questo il gesto di scorrimento
  // sulla lista "sfugge" e scorre tutta la schermata invece della sola lista interna.
  useEffect(() => {
    if (!namesOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [namesOpen]);

  // Il riquadro "Turno originale" si chiude toccando fuori dal pallino e dal riquadro stesso.
  useEffect(() => {
    if (!peekKey) return;
    const onDown = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-peek]")) setPeekKey(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [peekKey]);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOptions(JSON.parse(raw));
      const acc = Number(localStorage.getItem(ACCENT_KEY));
      if (Number.isInteger(acc) && acc >= 0 && acc < ACCENT_PAIRS.length) setAccentIdx(acc);
      setOverrides(loadOverrides());
      const rawRows = localStorage.getItem(ROWS_KEY);
      if (rawRows) setRows(JSON.parse(rawRows));
      const name = localStorage.getItem(FILENAME_KEY);
      if (name) setFileName(name);
      const sel = localStorage.getItem(SELECTED_KEY);
      if (sel) setSelected(sel);
      const mon = localStorage.getItem(MONTH_KEY);
      if (mon) {
        const d = new Date(mon);
        if (!Number.isNaN(d.getTime())) setMonth(startOfMonth(d));
      }
      const fs = localStorage.getItem(FILE_SUNDAY_KEY);
      if (fs) {
        const d = new Date(fs);
        if (!Number.isNaN(d.getTime())) setFileSunday(d);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Salva stato per la prossima apertura della PWA
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (rows.length > 0) localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
      else localStorage.removeItem(ROWS_KEY);
      if (fileName) localStorage.setItem(FILENAME_KEY, fileName);
      else localStorage.removeItem(FILENAME_KEY);
      if (selected) localStorage.setItem(SELECTED_KEY, selected);
      else localStorage.removeItem(SELECTED_KEY);
      if (month) localStorage.setItem(MONTH_KEY, month.toISOString());
      else localStorage.removeItem(MONTH_KEY);
      if (fileSunday) localStorage.setItem(FILE_SUNDAY_KEY, fileSunday.toISOString());
      else localStorage.removeItem(FILE_SUNDAY_KEY);
    } catch {
      /* quota superata: ignora */
    }
  }, [hydrated, rows, fileName, selected, month, fileSunday]);

  const persist = (next: string[]) => {
    setOptions(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const handleFile = async (file: File) => {
    // svuota la cache offline del file precedente prima di prendere in carico il nuovo
    await clearPreviousFileCache();
    setRows([]);
    setFileName(null);
    setDismissedSuggestions(new Set());
    const parsed = await parseExcel(file);
    setRows(parsed.rows);
    setMonth(parsed.month);
    setFileSunday(parsed.fileSunday);
    setFileName(file.name);
  };

  // Domenica di riferimento: l'ancora ESATTA letta da SETUP!E7 (anche se ricade nel mese
  // precedente, es. 30/08 per un file di settembre). Se il file non la fornisce, si ricade
  // sul calcolo basato sul mese (giorno prima del primo lunedì della griglia).
  const referenceSunday = useMemo(() => {
    if (fileSunday) return fileSunday;
    if (!month) return undefined;
    return addDays(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), -1);
  }, [fileSunday, month]);

  // Primo lunedì visualizzato: il giorno subito dopo la domenica di riferimento.
  const gridStart = useMemo(
    () => (referenceSunday ? addDays(referenceSunday, 1) : undefined),
    [referenceSunday],
  );

  // Chiave del mese del file: senza un mese riconoscibile le modifiche manuali sono disattivate.
  const monthK = month ? monthKey(month) : null;
  const overrideFor = useMemo(
    () => (date: Date, name: string): DayOverride | undefined =>
      monthK ? getOverride(overrides, monthK, dayKey(date), name) : undefined,
    [overrides, monthK],
  );

  const weeks: WeekData[] = useMemo(() => {
    if (!selected || rows.length === 0) return [];
    const matching = rows.filter((r) => nameMatches(r[1] ?? "", selected));

    // Each CSV row covers Sunday -> Saturday starting from the reference Sunday.
    // key = day offset from the reference Sunday
    const byOffset = new Map<number, DayData>();
    matching.forEach((row, i) => {
      const base = i * 7;
      // Sunday block (cols 3-6) is the first day of the row
      byOffset.set(base, blockData(row, DAY_BLOCKS[6]!));
      // Monday..Saturday follow the next days
      for (let d = 0; d < 6; d++) {
        byOffset.set(base + 1 + d, blockData(row, DAY_BLOCKS[d]!));
      }
    });

    // Displayed weeks run Monday -> Sunday and cover the selected month.
    const weekCount =
      gridStart && month
        ? differenceInCalendarWeeks(endOfMonth(month), gridStart, { weekStartsOn: 1 }) + 1
        : matching.length + 1;

    // +1 settimana di testa (w=-1): mostra la Domenica di riferimento (offset0, letta da
    // SETUP!E7), che cade il giorno prima del primo lunedì visualizzato e altrimenti non
    // rientrerebbe in nessuna settimana della griglia.
    return Array.from({ length: weekCount + 1 }, (_, j) => {
      const w = j - 1;
      const mondayOffset = w * 7 + 1;
      const monday = gridStart ? addDays(gridStart, w * 7) : undefined;
      const mods: boolean[] = [];
      const files: DayData[] = [];
      const days = Array.from({ length: 7 }, (_, i) => {
        const fromFile = byOffset.get(mondayOffset + i) ?? null;
        const ov = monday ? overrideFor(addDays(monday, i), selected) : undefined;
        // Il pallino sulla tessera segnala solo il turno ordinario modificato a mano: lo
        // straordinario si riconosce già dai quattro orari.
        mods.push(hasShiftOverride(ov));
        files.push(fromFile);
        return applyOverride(fromFile, ov);
      });
      return { monday, days, mods, files };
    });
  }, [rows, selected, month, gridStart, overrideFor]);


  // Nominativi trovati nella colonna B del file ma non ancora presenti nell'elenco voci
  // (né coperti, anche parzialmente, da uno già presente) e non ignorati dall'utente.
  const suggestedNames = useMemo(() => {
    if (rows.length === 0) return [];
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const r of rows) {
      const raw = (r[1] ?? "").trim();
      if (!looksLikeRealName(raw)) continue;
      const key = norm(raw);
      if (seen.has(key) || dismissedSuggestions.has(key)) continue;
      seen.add(key);
      candidates.push(raw);
    }
    return candidates.filter((name) => !options.some((o) => nameMatches(name, o)));
  }, [rows, options, dismissedSuggestions]);

  // Mappa offset -> turno per ogni nominativo presente nell'elenco voci (non solo il selezionato).
  const peopleByOffset = useMemo(() => {
    const map = new Map<string, Map<number, DayData>>();
    for (const name of options) {
      map.set(name, offsetMapForName(rows, name));
    }
    return map;
  }, [rows, options]);

  const openDayPopup = (date: Date | undefined) => {
    if (!date || !referenceSunday || rows.length === 0) return;
    setPopupDate(date);
  };

  // Elenchi "Apertura"/"Chiusura" del giorno aperto, ricalcolati anche quando cambia una modifica manuale.
  const dayPopup = useMemo(() => {
    if (!popupDate || !referenceSunday) return null;
    const offset = differenceInCalendarDays(popupDate, referenceSunday);
    const dayEntries: ShiftEntry[] = [];
    for (const name of options) {
      const ov = overrideFor(popupDate, name);
      const data = applyOverride(peopleByOffset.get(name)?.get(offset) ?? null, ov);
      if (!data) continue;
      // Con lo straordinario contano il primo ingresso e l'ultima uscita del giorno.
      const { start, end } = overallTimes(data);
      const s = toMinutes(start);
      const e = toMinutes(end);
      if (s === null || e === null) continue;
      dayEntries.push({ name, startLabel: start, endLabel: end, startMin: s, endMin: e, modified: !!ov });
    }

    const apre = dayEntries.filter((entry) => entry.startMin <= BASE_RANGE_START);

    // "Chiusura" è solo chi ha l'orario di chiusura più tardo di quel giorno specifico,
    // non chiunque arrivi a una soglia fissa: se quel giorno c'è un turno fino alle 20:30,
    // chi chiude alle 20:00 lo stesso giorno non compare più nell'elenco.
    const maxEnd = dayEntries.reduce((max, entry) => Math.max(max, entry.endMin), 0);
    const chiude = maxEnd >= BASE_RANGE_END ? dayEntries.filter((entry) => entry.endMin === maxEnd) : [];

    // Range della barra: l'inizio resta sempre fissato alle 10:00 (un turno che comincia
    // prima resta comunque segnalato in lista, ma sulla barra parte dal bordo sinistro).
    // La fine invece è dinamica: si allarga oltre le 20:00 se quel giorno c'è un turno che
    // chiude più tardi (es. venerdì/sabato alle 20:30), qualunque sia l'orario esatto.
    const barRange = { start: BASE_RANGE_START, end: Math.max(BASE_RANGE_END, maxEnd) };
    return { date: popupDate, apre, chiude, barRange };
  }, [popupDate, referenceSunday, options, peopleByOffset, overrideFor]);

  // Turno del nominativo selezionato come scritto nel file, per il giorno aperto.
  const selectedFileShift: DayData = useMemo(() => {
    if (!popupDate || !referenceSunday || !selected) return null;
    return offsetMapForName(rows, selected).get(differenceInCalendarDays(popupDate, referenceSunday)) ?? null;
  }, [popupDate, referenceSunday, selected, rows]);

  const changeOverride = (change: (current: DayOverride) => DayOverride) => {
    if (!monthK || !popupDate || !selected) return;
    const next = updateOverride(overrides, monthK, dayKey(popupDate), selected, change);
    setOverrides(next);
    saveOverrides(next);
  };

  const canEditShift = !!monthK && !!selected;
  const dateCapitalized = (d: Date, pattern: string) =>
    format(d, pattern, { locale: it }).replace(/^./, (c) => c.toUpperCase());

  return (
    <main className="min-h-screen pb-16" style={{ backgroundColor: "var(--app-bg)" }}>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        {/* Titolo + toolbar + giorno in testata (sticky, tutto opaco) */}
        <section className="sticky top-0 z-20" style={{ backgroundColor: "var(--app-bg)" }}>
          <header className="mb-4">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {month
                ? format(month, "MMMM yyyy", { locale: it }).replace(/^./, (c) => c.toUpperCase())
                : "Orari 1.0"}
            </h1>
          </header>

          <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button
                className="w-full gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm text-white hover:opacity-90"
                style={{ backgroundColor: "var(--app-upload)" }}
                onClick={() => fileRef.current?.click()}
                title="Carica file Excel"
              >
                <Upload className="size-4 shrink-0" />
                <span>Carica file Excel</span>
              </Button>
              <div className="flex gap-2">
                <Popover
                  open={namesOpen}
                  onOpenChange={(o) => {
                    setNamesOpen(o);
                    if (!o) {
                      setAdding(false);
                      setNewOption("");
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-full min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-2 text-sm"
                      aria-label="Filtra per voce"
                    >
                      <Users className="size-4 shrink-0 text-muted-foreground" />
                      <span className={cn("flex-1 truncate text-left", !selected && "text-muted-foreground")}>
                        {selected || "Nome"}
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 rounded-2xl p-2">
                    {/* Riga fissa: pulsante "+" e casella di inserimento (Opzione A: non scorre con la lista) */}
                    <div className="mb-2 flex shrink-0 items-center gap-2">
                      {adding ? (
                        <input
                          autoFocus
                          value={newOption}
                          onChange={(e) => setNewOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const v = newOption.trim();
                              if (v && !options.includes(v)) {
                                persist([...options, v]);
                                setSelected(v);
                              }
                              setNewOption("");
                            } else if (e.key === "Escape") {
                              setAdding(false);
                              setNewOption("");
                            }
                          }}
                          placeholder="Nuovo nome"
                          className="h-9 flex-1 rounded-xl border border-border bg-card px-3 text-[16px] text-foreground outline-none"
                        />
                      ) : (
                        <span className="flex-1 truncate text-sm text-muted-foreground">Aggiungi nome</span>
                      )}
                      <button
                        type="button"
                        aria-label="Aggiungi nome"
                        onClick={() => setAdding((a) => !a)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#34C759] text-white"
                      >
                        <Plus className="size-5" />
                      </button>
                    </div>

                    {/* Lista scrollabile: la riga sopra resta fissa anche con la tastiera aperta */}
                    <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain">
                      {sortedOptions.length === 0 && (
                        <li className="py-4 text-center text-sm text-muted-foreground">Nessun nome.</li>
                      )}
                      {sortedOptions.map((o) => (
                        <EntryRow
                          key={o}
                          name={o}
                          selected={o === selected}
                          onSelect={() => {
                            setSelected(o);
                            setNamesOpen(false);
                          }}
                          onDelete={() => {
                            persist(options.filter((x) => x !== o));
                            if (selected === o) setSelected("");
                          }}
                          onRename={(newName) => {
                            if (options.includes(newName)) return;
                            persist(options.map((x) => (x === o ? newName : x)));
                            if (selected === o) setSelected(newName);
                          }}
                        />
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
                <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Impostazioni"
                      title="Impostazioni"
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm"
                    >
                      <Settings className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 rounded-2xl p-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tema</p>
                    <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
                      {THEME_OPTIONS.map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          aria-label={`Tema ${label.toLowerCase()}`}
                          aria-pressed={themePref === value}
                          onClick={() => setThemePref(value)}
                          className={cn(
                            "flex h-8 items-center justify-center gap-1 rounded-lg text-xs text-foreground",
                            themePref === value ? "bg-card shadow-sm" : "opacity-70",
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Colore</p>
                    <div className="grid grid-cols-5 gap-2">
                      {ACCENT_PAIRS.map((pair, i) => (
                        <button
                          key={pair.light}
                          type="button"
                          aria-label={`Colore ${i + 1}`}
                          aria-pressed={i === accentIdx}
                          onClick={() => setAccentIndex(i)}
                          className={cn(
                            "size-8 rounded-full border transition-transform hover:scale-110",
                            i === accentIdx ? "border-foreground ring-2 ring-foreground/40" : "border-border",
                          )}
                          style={{ backgroundColor: isDark ? pair.dark : pair.light }}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>


            {fileName && (
              <p className="mt-2 truncate text-xs text-muted-foreground">File caricato: {fileName}</p>
            )}

            {suggestedNames.length > 0 && (
              <div className="mt-2 rounded-xl border border-border/60 bg-secondary/60 p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Nominativi trovati nel file, non in elenco:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDismissedSuggestions(
                        (prev) => new Set([...prev, ...suggestedNames.map((n) => norm(n))]),
                      )
                    }
                    className="shrink-0 text-xs text-muted-foreground underline"
                  >
                    Ignora
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => persist([...options, name])}
                      className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
                    >
                      <Plus className="size-3" />
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {weeks.length > 0 && (
            <div
              className="mt-2 grid grid-cols-7 gap-1 px-1 py-2 sm:gap-2"
              style={{ backgroundColor: "var(--app-bg)" }}
            >
              {DAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="truncate text-center text-[13px] font-extrabold uppercase tracking-wide text-foreground sm:text-base"
                >
                  {label.slice(0, 3)}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Month: one week per row, ciascuna settimana inscritta in una cornice */}
        <section className="mt-3 space-y-2">
          {weeks.map((week, weekIdx) => (
            <div
              key={weekIdx}
              className="rounded-2xl border border-border/60 p-1.5 sm:rounded-3xl sm:p-2"
              style={{ backgroundColor: "var(--app-week)" }}
            >
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {DAY_LABELS.map((label, i) => {
                  const date = week.monday ? addDays(week.monday, i) : undefined;
                  const data = week.days[i];
                  const today = date ? isToday(date) : false;
                  return (
                    <div
                      key={`${weekIdx}-${label}`}
                      className="relative h-24 cursor-pointer sm:h-[148px]"
                      onClick={() => openDayPopup(date)}
                    >
                      {/* Data: posizione fissa, indipendente dall'altezza della tessera */}
                      <div className="absolute inset-x-0 top-1 z-10 pb-1 text-center sm:top-2">
                        <div
                          className={cn(
                            "block truncate rounded-full px-2 text-[12px] sm:text-[16px]",
                            today && !data && "border-2 border-foreground",
                          )}
                          style={{ color: "var(--app-date)" }}
                        >
                          {date ? format(date, "d", { locale: it }) : "—"}
                        </div>
                      </div>
                      {week.mods[i] && (
                        <>
                          <span
                            role="img"
                            aria-label="Turno modificato"
                            className="pointer-events-none absolute right-[8px] top-[13px] z-20 size-[9px] rounded-full sm:right-[14px] sm:top-[16px]"
                            style={{ backgroundColor: accent, boxShadow: "0 0 0 1.5px var(--app-week)" }}
                          />
                          {/* Zona di tocco più ampia del pallino: mostra il turno scritto nel file */}
                          <button
                            type="button"
                            data-peek
                            aria-label="Mostra il turno originale"
                            aria-expanded={peekKey === `${weekIdx}-${i}`}
                            className="absolute right-0 top-[3px] z-30 size-[30px] rounded-lg sm:right-[6px] sm:top-[6px] sm:size-9"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPeekKey(peekKey === `${weekIdx}-${i}` ? null : `${weekIdx}-${i}`);
                            }}
                          />
                          {peekKey === `${weekIdx}-${i}` && (
                            <div
                              data-peek
                              role="status"
                              className={cn(
                                "absolute top-[36px] z-40 rounded-[10px] border border-border/60 bg-card px-[9px] py-1.5 text-foreground shadow-lg sm:top-[46px]",
                                i < 3 ? "left-0" : "right-0",
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="text-[10px] leading-tight text-muted-foreground">Turno originale</div>
                              <div className="whitespace-nowrap text-[13px] font-bold leading-snug">
                                {week.files[i] ? `${week.files[i]!.start} – ${week.files[i]!.end}` : "nessun turno"}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {data && (
                        <>
                          <article
                            className={cn(
                              "absolute inset-x-0 bottom-0 flex flex-col items-center justify-end rounded-xl bg-card p-1 shadow-sm sm:rounded-2xl sm:p-2",
                              today ? "border-2 border-foreground" : "border border-border/60",
                            )}
                            style={{ height: data.shortShift ? "70%" : "100%" }}
                          >
                            {data.total && (
                              <span
                                className={cn(
                                  "flex w-full items-center justify-center gap-[3px] whitespace-nowrap rounded-md px-1 py-[2px] text-center text-[10px] font-medium leading-none sm:gap-1 sm:rounded-xl sm:px-2 sm:py-[3px] sm:text-xs",
                                  data.late ? undefined : "bg-secondary text-foreground",
                                  data.ot && "gap-[2px] px-0.5 text-[9px]",
                                )}
                                style={data.late ? { backgroundColor: accent, color: contrastTextColor(accent) } : undefined}
                              >
                                {data.ot && (
                                  // Pallino: nella pillola colorata è "in sottrazione" (colore del fondo)
                                  <span
                                    aria-hidden
                                    className="size-[5px] shrink-0 rounded-full sm:size-[7px]"
                                    style={{ backgroundColor: data.late ? "var(--card)" : accent }}
                                  />
                                )}
                                <span>{data.total}</span>
                              </span>
                            )}
                          </article>
                          {data.ot && (
                            <>
                              {/* Zona di tocco del pallino: mostra le ore di straordinario */}
                              <button
                                type="button"
                                data-peek
                                aria-label="Mostra le ore di straordinario"
                                aria-expanded={peekKey === `ot-${weekIdx}-${i}`}
                                className="absolute bottom-0 left-0 z-30 h-[28px] w-1/2 rounded-lg sm:h-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPeekKey(peekKey === `ot-${weekIdx}-${i}` ? null : `ot-${weekIdx}-${i}`);
                                }}
                              />
                              {peekKey === `ot-${weekIdx}-${i}` && (
                                <div
                                  data-peek
                                  role="status"
                                  className={cn(
                                    "absolute bottom-[34px] z-40 rounded-[10px] border border-border/60 bg-card px-[9px] py-1.5 text-foreground shadow-lg sm:bottom-[48px]",
                                    i < 3 ? "left-0" : "right-0",
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-[10px] leading-tight text-muted-foreground">Straordinario</div>
                                  <div className="whitespace-nowrap text-[13px] font-bold leading-snug">{data.ot.otTotal}</div>
                                </div>
                              )}
                            </>
                          )}
                          {/* Orari: posizione fissa, poco sotto al bordo superiore della tessera bassa */}
                          <div
                            className={cn(
                              "absolute inset-x-0 z-10 flex flex-col items-center px-1 text-center sm:px-2",
                              data.ot ? "top-[21px] gap-px sm:top-[46px] sm:gap-0.5" : "top-[36px] gap-0.5 sm:top-[55px] sm:gap-1",
                            )}
                          >
                            <span
                              className={cn(
                                "text-[12px] font-bold text-foreground sm:text-base",
                                data.ot ? "leading-[1.1]" : "leading-tight",
                              )}
                            >
                              {data.start}
                            </span>
                            <span
                              className={cn(
                                "text-[12px] font-bold text-foreground sm:text-base",
                                data.ot ? "leading-[1.1]" : "leading-tight",
                              )}
                            >
                              {data.end}
                            </span>
                            {/* Straordinario: corpo più piccolo, sotto una linea sottile */}
                            {data.ot && (
                              <div className="mt-px flex w-[70%] flex-col items-center border-t border-border/60 pt-px text-[9px] font-medium leading-[1.1] text-foreground sm:mt-1 sm:pt-1 sm:text-[13px]">
                                <span>{data.ot.start}</span>
                                <span>{data.ot.end}</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {rows.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Carica il file Excel degli orari e seleziona un nome per iniziare.
          </p>
        )}
      </div>

      <Dialog open={!!dayPopup} onOpenChange={(o) => !o && setPopupDate(null)}>
        <DialogContent
          className="w-[344px] max-w-[calc(100vw-2rem)] gap-3.5 border-0 bg-transparent p-0 shadow-none sm:rounded-none"
          showCloseButton={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-lg">
            <DialogTitle className="mb-3 whitespace-nowrap text-lg font-semibold leading-tight tracking-normal">
              {dayPopup ? dateCapitalized(dayPopup.date, "EEEE d MMMM") : ""}
            </DialogTitle>

            <h3 className="mb-1.5 text-base font-normal text-foreground">Apertura</h3>
            {dayPopup && dayPopup.apre.length > 0 ? (
              <ul className="mb-4 space-y-1">
                {dayPopup.apre.map((entry) => (
                  <ShiftRow key={entry.name} entry={entry} range={dayPopup.barRange} accent={accent} />
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">Nessuno.</p>
            )}

            <h3 className="mb-1.5 text-base font-normal text-foreground">Chiusura</h3>
            {dayPopup && dayPopup.chiude.length > 0 ? (
              <ul className="space-y-1">
                {dayPopup.chiude.map((entry) => (
                  <ShiftRow key={entry.name} entry={entry} range={dayPopup.barRange} accent={accent} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nessuno.</p>
            )}
          </div>

          {dayPopup && canEditShift && (
            <DayEditPanels
              key={`${dayKey(dayPopup.date)}|${selected}`}
              subtitle={`${selected} · ${dateCapitalized(dayPopup.date, "EEE d MMM")}`}
              fileShift={selectedFileShift}
              ordinary={applyOverride(selectedFileShift, overrideFor(dayPopup.date, selected), false)}
              override={overrideFor(dayPopup.date, selected)}
              accent={accent}
              accentText={contrastTextColor(accent)}
              onSaveShift={(shift) =>
                changeOverride((cur) => ({
                  rest: shift.rest,
                  start: shift.start,
                  end: shift.end,
                  // Se il giorno passa a riposo lo straordinario non ha più un ordinario a cui agganciarsi.
                  ot: shift.rest ? undefined : cur.ot,
                }))
              }
              onResetShift={() => changeOverride((cur) => ({ ot: cur.ot }))}
              onSaveOvertime={(ot: Overtime) => changeOverride((cur) => ({ ...cur, ot }))}
              onRemoveOvertime={() => changeOverride((cur) => ({ rest: cur.rest, start: cur.start, end: cur.end }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
