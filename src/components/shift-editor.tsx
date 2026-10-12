import { useState } from "react";
import { ChevronDown, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { type ShiftOverride } from "@/lib/overrides";
import { formatHours, minutesToTime, netMinutes, toMinutes, type DayData } from "@/lib/shifts";

type Draft = { rest: boolean; start: string; end: string };

function draftFrom(source: ShiftOverride | DayData | undefined): Draft {
  if (!source) return { rest: false, start: "", end: "" };
  if ("rest" in source && source.rest) return { rest: true, start: "", end: "" };
  const s = toMinutes(source.start);
  const e = toMinutes(source.end);
  return {
    rest: false,
    start: s === null ? "" : minutesToTime(s),
    end: e === null ? "" : minutesToTime(e),
  };
}

/**
 * Seconda finestra del popup del giorno: si espande toccando "Modifica turno" e permette di
 * cambiare a mano il turno del nominativo selezionato (o di segnarlo a riposo).
 * Va montata con una `key` diversa per ogni giorno/nominativo, così riparte chiusa.
 */
export function ShiftEditor({
  subtitle,
  fileShift,
  override,
  accent,
  accentText,
  onSave,
  onReset,
}: {
  subtitle: string;
  fileShift: DayData;
  override: ShiftOverride | undefined;
  accent: string;
  accentText: string;
  onSave: (ov: ShiftOverride) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(override ?? fileShift ?? undefined));

  const s = toMinutes(draft.start);
  const e = toMinutes(draft.end);
  const timesOk = s !== null && e !== null && draft.start !== draft.end;
  const valid = draft.rest || timesOk;
  const info = draft.rest
    ? "Il giorno resterà senza turno."
    : timesOk
      ? `Ore lavorate: ${formatHours(netMinutes(s, e))}`
      : "Inserisci inizio e fine del turno.";

  const toggle = () => {
    if (!open) setDraft(draftFrom(override ?? fileShift ?? undefined));
    setOpen(!open);
  };

  const inputClass =
    "box-border flex h-11 w-full min-w-0 max-w-full appearance-none items-center rounded-xl border border-border bg-clip-padding px-3 py-0 text-left text-[17px] leading-none text-foreground [-webkit-appearance:none] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:text-left";

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-lg">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <h3 className="text-lg font-semibold">Modifica turno</h3>
        <span className="inline-flex items-center gap-2.5">
          {override && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
              Modificato
            </span>
          )}
          <ChevronDown className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="mt-1 flex flex-col gap-3">
          <div className="text-[13px] text-muted-foreground">{subtitle}</div>

          <div className="flex min-h-11 items-center justify-between gap-3">
            <span id="shift-rest-label" className="text-[15px] text-foreground">
              Nessun turno (a riposo)
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.rest}
              aria-labelledby="shift-rest-label"
              onClick={() => setDraft({ ...draft, rest: !draft.rest })}
              className="relative h-8 w-[52px] shrink-0 rounded-full"
              style={{ backgroundColor: draft.rest ? accent : "var(--app-switch-off)" }}
            >
              <span
                className="absolute top-[3px] size-[26px] rounded-full bg-white shadow"
                style={{ left: draft.rest ? 23 : 3 }}
              />
            </button>
          </div>

          <div className={cn("grid grid-cols-2 gap-2.5", draft.rest && "pointer-events-none opacity-40")}>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
              Inizio
              <input
                type="time"
                value={draft.start}
                onChange={(ev) => setDraft({ ...draft, start: ev.target.value })}
                className={inputClass}
                style={{ backgroundColor: "var(--app-chip)" }}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
              Fine
              <input
                type="time"
                value={draft.end}
                onChange={(ev) => setDraft({ ...draft, end: ev.target.value })}
                className={inputClass}
                style={{ backgroundColor: "var(--app-chip)" }}
              />
            </label>
          </div>

          <div className="min-h-5 text-sm text-muted-foreground">{info}</div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 flex-1 rounded-xl border border-border text-[15px] text-foreground"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() => {
                onSave(draft.rest ? { rest: true, start: "", end: "" } : { rest: false, start: draft.start, end: draft.end });
                setOpen(false);
              }}
              className="min-h-11 flex-1 rounded-xl text-[15px] font-semibold disabled:opacity-40"
              style={{ backgroundColor: accent, color: accentText }}
            >
              Salva
            </button>
          </div>

          {override && (
            <button
              type="button"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-[15px] text-foreground"
            >
              <Undo2 className="size-[18px]" aria-hidden="true" />
              Ripristina turno originale
            </button>
          )}
        </div>
      )}
    </div>
  );
}
