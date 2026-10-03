import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { STATO_GARA, type StatoGara, type Tono } from "@/dominio/fasi"

export type Filtro = StatoGara | "tutte"
export const FILTRI: readonly { id: Filtro; etichetta: string; tono?: Tono }[] = [
  { id: "tutte", etichetta: "Tutte" },
  { id: "da_rivedere", etichetta: STATO_GARA.da_rivedere.etichetta, tono: "attn" },
  { id: "in_esecuzione", etichetta: STATO_GARA.in_esecuzione.etichetta, tono: "run" },
  { id: "errore", etichetta: STATO_GARA.errore.etichetta, tono: "crit" },
  { id: "completata", etichetta: "Completate", tono: "ok" },
]
export const etichettaFiltro = (id: Filtro) => FILTRI.find((f) => f.id === id)?.etichetta ?? id

const PUNTO: Record<Tono, string> = {
  run: "bg-status-run", attn: "bg-status-attn", ok: "bg-status-ok", crit: "bg-status-crit", neu: "bg-status-neu",
}

/** Schede per stato con conteggio, una attiva alla volta, e ricerca a destra.
    Filtro e ricerca si combinano; nessuno dei due azzera l'altro. */
export function FiltriGare({ filtro, conteggi, onFiltro, ricerca, onRicerca }: {
  filtro: Filtro
  conteggi: Partial<Record<Filtro, number>>
  onFiltro: (f: Filtro) => void
  ricerca: string
  onRicerca: (q: string) => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b">
      <div role="group" aria-label="Filtra per stato" className="flex flex-wrap gap-0.5">
        {FILTRI.map((f) => {
          const attivo = filtro === f.id
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={attivo}
              onClick={() => onFiltro(f.id)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 pb-2 pt-1.5 text-xs transition-colors duration-(--d-fast)",
                attivo ? "border-foreground font-medium text-foreground" : "border-transparent text-foreground-2 hover:text-foreground",
              )}
            >
              {f.tono && <i className={cn("size-1.5 rounded-full", PUNTO[f.tono])} aria-hidden="true" />}
              {f.etichetta}
              <span className={cn("font-mono text-micro", attivo ? "text-foreground-2" : "text-muted-foreground")}>{conteggi[f.id] ?? 0}</span>
            </button>
          )
        })}
      </div>
      <label className="relative mb-2 ml-auto block w-full max-w-60 max-sm:ml-0 max-sm:max-w-none">
        <span className="sr-only">Cerca fra le gare</span>
        <MagnifyingGlassIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={ricerca} onChange={(e) => onRicerca(e.target.value)} placeholder="Cerca per nome o slug" autoComplete="off" className="h-7 pl-7 text-xs" />
      </label>
    </div>
  )
}
