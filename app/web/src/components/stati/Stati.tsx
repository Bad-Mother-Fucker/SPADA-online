import type { ReactNode } from "react"
import { WarningIcon, ArrowClockwiseIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ApiError } from "@/lib/api"
import { Api } from "@/lib/api"

/** Stato vuoto: spiega cosa comparirà qui e offre l'azione per popolarlo. */
/** Il dettaglio dell'errore arriva dal servizio senza punteggiatura garantita: chiude la frase. */
const frase = (t?: string) => { const x = (t || "").trim(); return x ? ` ${/[.!?…]$/.test(x) ? x : x + "."}` : "" }

export function StatoVuoto({ icona, titolo, testo, azioni, className }: { icona: ReactNode; titolo: string; testo: ReactNode; azioni?: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-apparizione flex flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-10 place-items-center rounded-lg bg-muted text-foreground-2" aria-hidden="true">{icona}</div>
      <h2 className="text-md font-semibold">{titolo}</h2>
      <p className="mt-1.5 max-w-[48ch] text-sm text-foreground-2">{testo}</p>
      {azioni && <div className="mt-5 flex flex-wrap justify-center gap-2">{azioni}</div>}
    </div>
  )
}

/** Errore di sistema senza dati a schermo: cosa è successo, codice e
    percorso se noti, cosa non è cambiato, e un Riprova. */
export function StatoErrore({ titolo, errore, percorso, nota, onRiprova, inCorso }: { titolo: string; errore: ApiError; percorso: string; nota?: string; onRiprova: () => void; inCorso?: boolean }) {
  return (
    <div role="alert" className="animate-apparizione rounded-lg border border-status-crit/40 bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-status-crit-soft text-status-crit" aria-hidden="true"><WarningIcon size={18} /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-md font-semibold">{titolo}</h2>
          <p className="mt-1 text-sm text-foreground-2">
            {errore.timeout ? "Il servizio non ha risposto in tempo per " : errore.stato ? <>Il servizio ha risposto <code className="font-mono text-foreground">{errore.stato}</code> per </> : "Nessuna risposta dal servizio per "}
            <code className="font-mono text-foreground">{percorso}</code>.
            {frase(errore.dettaglio || errore.message)}
            {nota && <> {nota}</>}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onRiprova} disabled={inCorso}><ArrowClockwiseIcon aria-hidden="true" />{inCorso ? "Riprovo" : "Riprova"}</Button>
            <Button variant="outline" asChild><a href={`${Api.base()}/docs`} target="_blank" rel="noopener">Stato del servizio</a></Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Dati a schermo ma non più freschi: si avvisa, non si cancella. */
export function AvvisoStantio({ messaggio, onRiprova, inCorso }: { messaggio: string; onRiprova: () => void; inCorso?: boolean }) {
  return (
    <div role="status" className="animate-apparizione mb-3 flex items-center gap-3 rounded-md border border-status-attn/40 bg-status-attn-soft px-3 py-2 text-sm">
      <WarningIcon size={16} className="shrink-0 text-status-attn" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-foreground">{messaggio}</span>
      <Button size="sm" variant="outline" onClick={onRiprova} disabled={inCorso}>{inCorso ? "Riprovo" : "Riprova"}</Button>
    </div>
  )
}
