// Entry point SSR di TanStack Start. Anche per un sito interamente statico serve un entry
// esplicito: sia in fase di build (il prerender di Nitro lo usa per generare l'HTML delle
// pagine) sia per la build dell'ambiente "ssr" di Vite/Nitro (senza un entry dichiarato la
// risoluzione dell'input fallisce). Nessuna logica specifica per una piattaforma: nessun
// server gira realmente a runtime una volta pubblicato su GitHub Pages.
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
