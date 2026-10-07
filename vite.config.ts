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
});
