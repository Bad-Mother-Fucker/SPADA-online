import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Api, type CreaGara, type Gara } from "@/lib/api"
import { statoGara } from "@/dominio/fasi"

export const chiaviGare = {
  elenco: ["gare"] as const,
  output: (slug: string) => ["gare", slug, "output"] as const,
  dettaglio: (slug: string) => ["gare", slug, "dettaglio"] as const,
  prezzari: ["sistema", "prezzari"] as const,
}

/** L'elenco si aggiorna tornando sulla finestra e a intervalli: ogni 10 s
    se una gara sta girando, altrimenti ogni 30 s. */
export function useGare() {
  return useQuery({
    queryKey: chiaviGare.elenco,
    queryFn: ({ signal }) => Api.elencoGare({ signal }),
    refetchInterval: (query) => {
      const lista = query.state.data
      return lista?.some((g) => statoGara(g.fasi) === "in_esecuzione") ? 10_000 : 30_000
    },
  })
}

/** Numero di elaborati e scadenza non stanno in GET /gare: una chiamata per
    gara, dopo la griglia, che riempie i due segnaposto già presenti. */
export function useArricchimento(slug: string, attivo = true) {
  const output = useQuery({
    queryKey: chiaviGare.output(slug),
    queryFn: ({ signal }) => Api.elencoOutput(slug, { signal }),
    // Si contano gli elaborati, non tutti i file: le viste HTML in 11_view/
    // sono gemelli degli stessi documenti.
    select: (p) => p.filter((x) => x.endsWith(".md") && !x.startsWith("11_view/")).length,
    staleTime: 60_000,
    enabled: attivo,
  })
  const dettaglio = useQuery({
    queryKey: chiaviGare.dettaglio(slug),
    queryFn: ({ signal }) => Api.dettaglioGara(slug, { signal }),
    select: (d) => d.manifest?.gara?.scadenza_offerta ?? null,
    staleTime: 60_000,
    enabled: attivo,
  })
  return {
    elaborati: output.data,
    elaboratiInCaricamento: output.isPending,
    elaboratiIllegibili: output.isError,
    scadenza: dettaglio.data,
    scadenzaInCaricamento: dettaglio.isPending,
  }
}

export function usePrezzari(attivo = true) {
  return useQuery({
    queryKey: chiaviGare.prezzari,
    queryFn: ({ signal }) => Api.sistemaPrezzari({ signal }),
    staleTime: 5 * 60_000,
    enabled: attivo,
  })
}

export function useCreaGara() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dati: CreaGara) => Api.creaGara(dati),
    onSuccess: () => qc.invalidateQueries({ queryKey: chiaviGare.elenco }),
  })
}

/** Eliminazione ottimistica: la card sparisce subito; se il backend rifiuta
    (409 con una fase in esecuzione, rete) la lista torna com'era. */
export function useEliminaGara() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => Api.eliminaGara(slug),
    onMutate: async (slug) => {
      await qc.cancelQueries({ queryKey: chiaviGare.elenco })
      const prima = qc.getQueryData<Gara[]>(chiaviGare.elenco)
      qc.setQueryData<Gara[]>(chiaviGare.elenco, (l) => l?.filter((g) => g.slug !== slug))
      return { prima }
    },
    onError: (_e, _slug, ctx) => {
      if (ctx?.prima) qc.setQueryData(chiaviGare.elenco, ctx.prima)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiaviGare.elenco }),
  })
}
