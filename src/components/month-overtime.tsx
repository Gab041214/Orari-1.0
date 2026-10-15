import { ChevronDown } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Finestra di sola consultazione: i giorni del mese con straordinario e le relative ore,
 * con il totale in fondo. Il PDF si genera dal menu Impostazioni.
 */
export function MonthOvertimeDialog({
  open,
  onOpenChange,
  subtitle,
  rows,
  total,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtitle: string;
  rows: { label: string; hours: string }[];
  total: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[max(1rem,calc(50dvh-380px))] max-h-[calc(100dvh-2rem)] w-[360px] max-w-[calc(100vw-1rem)] translate-y-0 gap-3.5 overflow-y-auto border-0 bg-transparent px-2 pb-3 pt-0 shadow-none sm:rounded-none"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg font-semibold leading-tight tracking-normal">
              Straordinari del mese
            </DialogTitle>
            <button
              type="button"
              aria-label="Chiudi"
              onClick={() => onOpenChange(false)}
              className="rounded-md text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown className="size-5 shrink-0 rotate-180" />
            </button>
          </div>
          <div className="mt-1 text-base text-muted-foreground">{subtitle}</div>

          {rows.length > 0 ? (
            <>
              <ul className="mt-3 rounded-xl px-3 py-1" style={{ backgroundColor: "var(--app-chip)" }}>
                {rows.map((r, i) => (
                  <li
                    key={r.label}
                    className={
                      "flex min-h-11 items-center justify-between text-base text-foreground" +
                      (i > 0 ? " border-t border-border/60" : "")
                    }
                  >
                    <span>{r.label}</span>
                    <span className="font-semibold">{r.hours}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between px-3 pt-3.5">
                <span className="text-base font-semibold text-foreground">Totale</span>
                <span className="text-[22px] font-bold text-foreground">{total}</span>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Nessuno straordinario in questo mese.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
