import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Sito pubblicato sotto un sottopercorso su GitHub Pages (es. /nome-repo/):
    // basepath allinea i link generati dal router al prefisso reale del sito.
    basepath: import.meta.env.BASE_URL,
  });

  return router;
};
