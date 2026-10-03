import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { Api, ApiError } from "@/lib/api"

export type StatoBackend = "verifica" | "connesso" | "irraggiungibile"

export const CHIAVE_SALUTE = ["salute"] as const

/** Raggiungibilità reale del backend: /salute ogni 30 secondi, ricontrollato
    subito quando un'altra richiesta fallisce per rete. Il badge in barra
    riflette questo, non l'esito dell'ultimo fetch dell'elenco. */
export function useStatoBackend(): { stato: StatoBackend; ultimaRisposta: number | null; ricontrolla: () => void } {
  const q = useQuery({
    queryKey: CHIAVE_SALUTE,
    queryFn: ({ signal }) => Api.salute({ signal }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
    gcTime: Infinity,
  })
  const stato: StatoBackend = q.isPending && !q.data ? "verifica" : q.isError ? "irraggiungibile" : "connesso"
  return { stato, ultimaRisposta: q.dataUpdatedAt || null, ricontrolla: () => { void q.refetch() } }
}

/** Da usare dove una richiesta può fallire per rete: ricontrolla la salute
    subito, così il badge non aspetta il prossimo giro. */
export function useRicontrollaSaluteSe(errore: unknown) {
  const qc = useQueryClient()
  useEffect(() => {
    if (errore instanceof ApiError && (errore.stato === 0 || errore.timeout)) {
      void qc.invalidateQueries({ queryKey: CHIAVE_SALUTE })
    }
  }, [errore, qc])
}
