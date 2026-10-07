import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
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
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    // Preset di deploy (es. "github_pages") passato dalla CI tramite la variabile
    // d'ambiente NITRO_PRESET (vedi .github/workflows/deploy.yml); in locale non è
    // impostata e Nitro usa il proprio target di default.
    nitro(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      // IMPORTANTE: senza questo, il plugin genera sw.js in "dist/" (cartella intermedia
      // di Vite), che Nitro NON copia in .output/public (la cartella pubblicata davvero su
      // GitHub Pages). Risultato: /sw.js risponde con l'HTML dell'app invece del vero
      // service worker, la registrazione fallisce in silenzio e l'offline non funziona mai.
      outDir: ".output/public",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        // Il plugin ha 'index.html' come default SEMPRE attivo per navigateFallback
        // (fuso via Object.assign con le nostre opzioni): omettere semplicemente questa
        // chiave NON basta a disattivarlo, va sovrascritta esplicitamente con undefined.
        // Con un'unica route ("/") non serve un fallback SPA per path arbitrari, e il file
        // "index.html" precaricato di default dal plugin non corrisponde comunque al nostro
        // output — senza questa riga il Service Worker va in errore all'attivazione e
        // l'offline non funziona mai.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-navigations",
              networkTimeoutSeconds: 5,
            },
          },
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
  // Entry esplicito per l'ambiente SSR: senza questo la build del server (usata anche dal
  // prerender per generare l'HTML statico di ogni pagina) fallisce perché Vite non sa quale
  // file compilare come server e ripiega su un default non valido per un'SSR build.
  environments: {
        ssr: { build: { rollupOptions: { input: "./src/server.ts" } } },
  },
});

