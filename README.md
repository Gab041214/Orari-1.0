# Orari 1.0

Progressive Web App (PWA) per iOS: calendario mensile dei turni di lavoro, con caricamento di un file Excel come sorgente dati.

## Stack tecnico

React, TanStack Router/Start, shadcn/ui, Tailwind, Vite, Bun.

## Sviluppo locale

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

L'app viene pre-renderizzata come sito statico (nessun server a runtime, preset Nitro `github_pages`) e pubblicata in `.output/public`.

## Deploy

Pubblicato su GitHub Pages tramite GitHub Actions (vedi `.github/workflows/deploy.yml`): ogni push su `main` builda il sito e lo pubblica su `https://<utente>.github.io/<repo>/`.

Per attivarlo su un repository nuovo:

1. Impostazioni della repo → **Pages** → **Source**: scegli **GitHub Actions**.
2. Esegui `bun install` in locale e committa il `bun.lock` generato (il workflow usa `bun install --frozen-lockfile`).
3. Fai push su `main`: il workflow builda e pubblica automaticamente.

Il base path (`/<repo>/`) viene calcolato automaticamente dal nome della repository in CI; per una build locale resta `/`.
