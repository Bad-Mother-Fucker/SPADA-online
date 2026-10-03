// Il pattern unico per lo stato di una richiesta al backend (CLAUDE.md,
// "Stato delle richieste"). Ogni vista legge uno di questi sei stati, mai
// dedotti dall'assenza di dati:
//
//   caricamento  prima risposta non ancora arrivata (skeleton)
//   vuoto        risposta arrivata, nessun contenuto (stato vuoto con azione)
//   assente      il backend non espone l'endpoint (405/501): versione vecchia
//   errore       la richiesta è fallita (messaggio, causa, Riprova)
//   ok           dati pronti
//
// e in più `stantio`: ci sono dati, ma l'ultimo aggiornamento è fallito.

import type { QueryObserverResult } from "@tanstack/react-query"
import { ApiError } from "./api"

export type StatoRisorsa = "caricamento" | "vuoto" | "assente" | "errore" | "ok"

export interface Risorsa<T> {
  stato: StatoRisorsa
  dati: T | undefined
  errore: ApiError | null
  /** Dati presenti ma non più freschi: l'ultimo aggiornamento è fallito. */
  stantio: boolean
  /** Un aggiornamento è in corso mentre i dati vecchi restano a schermo. */
  aggiornamento: boolean
  riprova: () => void
}

export function comeApiError(e: unknown, percorso = ""): ApiError {
  if (e instanceof ApiError) return e
  if (e instanceof DOMException && e.name === "TimeoutError") {
    return new ApiError("Il servizio non ha risposto in tempo", { percorso, timeout: true })
  }
  return new ApiError(e instanceof Error ? e.message : String(e), { percorso })
}

/** Da un risultato di TanStack Query allo stato esplicito della vista.
    `vuoto` decide quando una risposta valida non ha contenuto. */
export function risorsa<T>(
  q: QueryObserverResult<T>,
  opzioni: { vuoto?: (d: T) => boolean; percorso?: string } = {},
): Risorsa<T> {
  const errore = q.error ? comeApiError(q.error, opzioni.percorso) : null
  const haDati = q.data !== undefined
  const riprova = () => { void q.refetch() }
  const comune = { dati: q.data, errore, aggiornamento: q.isFetching && haDati, riprova }

  if (!haDati && (q.isPending || (q.isFetching && !errore))) return { ...comune, stato: "caricamento", stantio: false }
  if (!haDati && errore) {
    if (errore.assente) return { ...comune, stato: "assente", stantio: false }
    if (errore.nonProdotto) return { ...comune, stato: "vuoto", stantio: false }
    return { ...comune, stato: "errore", stantio: false }
  }
  const stantio = !!errore && haDati
  if (haDati && opzioni.vuoto && opzioni.vuoto(q.data as T)) return { ...comune, stato: "vuoto", stantio }
  return { ...comune, stato: "ok", stantio }
}
