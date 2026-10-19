import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Per un GitHub Pages "project site" il sito vive sotto https://<utente>.github.io/<repo>/,
// quindi ogni asset va referenziato con quel prefisso. Il workflow di deploy calcola questo
// valore dal nome della repo e lo passa come VITE_BASE_PATH; in locale (dev/build senza CI)
// resta "/".
const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [
    // Modalità SPA: la build produce solo file statici (nessun server a runtime), adatti a
    // GitHub Pages. La pagina iniziale viene generata come index.html nella cartella
    // dist/client, che è quella pubblicata.
    tanstackStart({
      spa: {
        enabled: true,
        prerender: { outputPath: "/index.html" },
      },
    }),
    viteReact(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      // Il service worker deve finire nella cartella pubblicata davvero su GitHub Pages
      // (dist/client), altrimenti /sw.js non esiste e l'offline non funziona.
      outDir: "dist/client",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        // La pagina iniziale (index.html) viene generata da TanStack Start DOPO che il plugin PWA
        // ha già elencato i file della build, quindi il glob non la trova e non finisce tra i file
        // precaricati: offline (o con segnale debole) Safari non trovava la pagina. La escludiamo dal
        // glob e la aggiungiamo a mano all'elenco, con una versione diversa a ogni build, così il
        // service worker la scarica a ogni deploy e può sempre servirla dalla cache.
        globIgnores: ["**/index.html"],
        additionalManifestEntries: [{ url: "index.html", revision: String(Date.now()) }],
        // Ogni apertura dell'app parte subito dalla pagina in cache (niente attesa di rete); le nuove
        // versioni si scaricano in background e si vedono all'apertura successiva.
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
              sameOrigin &&
              (request.destination === "script" ||
                request.destination === "style" ||
                request.destination === "font" ||
                request.destination === "image"),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: { tsconfigPaths: true },
});
