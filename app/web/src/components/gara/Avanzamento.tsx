// Cosa sta facendo un'esecuzione, passo per passo, sotto «Esecuzione in
// corso»: le stesse frasi della ricerca approfondita dell'assistente
// («Leggo il nodo del grafo …», «Aggiorno l'indice …»). Sostituisce la riga
// «Avviata … fa»; se il backend non dà passi, resta quella (fallback).

import type { ReactNode } from "react"
import { useGara } from "./GaraContext"
import { useAvanzamento } from "@/hooks/useGaraDati"
import { quandoRelativo } from "@/lib/formato"
import { cn } from "@/lib/utils"

export function Avanzamento({ fase, deliverable, attivo, fallback, className }: { fase?: number; deliverable?: string; attivo: boolean; fallback: ReactNode; className?: string }) {
  const { slug } = useGara()
  const q = useAvanzamento(slug, { fase, deliverable }, attivo)
  const a = q.data
  if (!attivo || !a || !a.attuale) return <>{fallback}</>
  const contesto = [a.criterio && `Criterio ${a.criterio}`, a.deliverable_id && `Deliverable ${a.deliverable_id}`, a.avviato_il && `avviato ${quandoRelativo(a.avviato_il)}`].filter(Boolean).join(", ")
  return (
    <div className={cn("min-w-0 space-y-1 rounded-md border bg-background px-2.5 py-2 text-left", className)}>
      {contesto && <p className="text-micro text-muted-foreground">{contesto}</p>}
      <p aria-live="polite" className="line-clamp-2 text-xs font-medium text-foreground">{a.attuale}</p>
      {a.precedenti.length > 0 && (
        <ul aria-label="Passi precedenti" className="space-y-0.5">
          {a.precedenti.map((p, i) => <li key={`${i}-${p}`} className="truncate text-micro text-muted-foreground">{p}</li>)}
        </ul>
      )}
      {a.aggiornato_il && <p className="text-micro text-muted-foreground">Ultimo passo {quandoRelativo(a.aggiornato_il)}. Puoi chiudere la pagina: continua lo stesso.</p>}
    </div>
  )
}
