import { QueryClient } from "@tanstack/react-query"
import { ApiError } from "./api"

// Impostazioni comuni a tutte le richieste. Un solo tentativo automatico
// sugli errori di rete, nessuno sugli errori del server: lo stato di errore
// va mostrato, con il suo Riprova, non nascosto da tentativi silenziosi.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (tentativi, e) => tentativi < 1 && e instanceof ApiError && e.stato === 0 && !e.timeout,
      retryDelay: 1_500,
    },
    mutations: { retry: 0 },
  },
})
