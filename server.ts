// Entry point SSR di TanStack Start. Anche per un sito interamente statico serve un entry
// esplicito: Nitro lo usa in fase di build per generare l'HTML delle pagine. Deve stare nella
// cartella principale del progetto (Nitro non lo cerca in src/). Nessuna logica specifica
// per una piattaforma: nessun server gira realmente a runtime su GitHub Pages.
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
