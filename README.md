# Orari 1.0

PWA (Progressive Web App) pensata per iPhone e iPad: legge il file Excel dei turni e lo trasforma in un calendario mensile, con orari, ore lavorate e, per ogni giorno, chi apre e chi chiude. Funziona anche offline.

## Funzioni

- Caricamento di uno o più file Excel (.xlsx, .xlsm, .xls): ogni file va al suo mese, con fino a 12 mesi in memoria; un file si elimina dal menu dei mesi scorrendolo verso sinistra
- Calendario mensile per nominativo, con orari, totale delle ore (1 ora di pausa tolta oltre le 8 ore), turni corti e turni che chiudono tardi evidenziati
- Totale delle ore di ogni settimana (da domenica a sabato), con ordinario e straordinario
- Pop-up del giorno con chi apre e chi chiude, e barra degli orari
- Modifica manuale dei turni e straordinari, con esportazione e importazione delle modifiche tra dispositivi
- Nomi associati: una grafia diversa nel file viene letta come un nome già in elenco
- Orari di esercizio per giorno della settimana, dedotti dai file e correggibili
- Report mensile in PDF
- Tema chiaro e scuro, colore d'accento a scelta
- Nessun server dati: tutto resta nel dispositivo (localStorage)

## Il file Excel

- Foglio "Inserimento Orari": nominativi nella colonna B, giorni in blocchi di colonne
- Foglio "SETUP", cella E7: domenica di riferimento da cui partono le righe
- Il mese si ricava dal nome del file, che deve contenere il mese in italiano e l'anno (per esempio `10_rostering_ottobre_2026.xlsx`)

## Stack tecnico

React 19, TanStack Router e Start, shadcn/ui, Tailwind CSS, Vite, Bun, xlsx, date-fns, vite-plugin-pwa.

## Struttura

- `src/routes/index.tsx`: pagina e interfaccia
- `src/routes/__root.tsx`: struttura della pagina, meta tag PWA, registrazione del service worker
- `src/lib/`: logica (turni e ore, file caricati, modifiche manuali, nomi associati, backup, orari di esercizio, report PDF, tema, service worker, errori)
- `src/components/`: editor dei turni e straordinari; `ui/` contiene i componenti shadcn
- `src/start.ts`: gestione degli errori
- `vite.config.ts`: build e configurazione PWA
- `public/`: manifest e icone

## Sviluppo locale

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

L'app è un sito statico (modalità SPA di TanStack Start, nessun server a runtime): la build produce i file da pubblicare in `dist/client`.

## Pubblicazione

Su GitHub Pages tramite GitHub Actions (vedi `.github/workflows/deploy.yml`): ogni commit sul ramo `main` builda il sito e lo pubblica su `https://<utente>.github.io/<repo>/`. L'esito si vede nella scheda **Actions** della repository.

Per attivarlo su una repository nuova:

1. Impostazioni della repo → **Pages** → **Source**: scegli **GitHub Actions**.
2. Fai push su `main`: il workflow builda e pubblica automaticamente.

Il base path (`/<repo>/`) viene calcolato dal nome della repository durante la build in CI; in locale resta `/`.

## PWA e offline

Il service worker tiene in cache pagina e risorse. Dopo un aggiornamento, l'app installata mostra la versione nuova alla seconda apertura. Per provare un deploy senza cache si apre il sito in una scheda privata di Safari. Aprendo l'indirizzo con `?sw=off` il service worker viene disattivato e rimosso.

Rimuovere l'app dalla schermata Home cancella i dati salvati: prima va esportato il backup delle modifiche.
