// Pausa e ripresa di un'attività in esecuzione (fase, deliverable). La pausa
// è reale: il worker sospende i processi del job e li riprende da dove
// erano (worker.py, _gestisci_pausa). Qui si chiede e si mostra lo stato
// vero: «in pausa» compare quando il worker l'ha applicata, non al clic.

import { PauseIcon, PlayIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useGara } from "./GaraContext"
import { usePausaJob } from "@/hooks/useGaraDati"
import { comeApiError } from "@/lib/risorsa"
import { quandoRelativo } from "@/lib/formato"
import type { JobFase } from "@/dominio/fasi"

/** Limite dichiarato, non nascosto: Claude è fermo a metà di una richiesta. */
export const NOTA_PAUSA = "Durante la pausa il lavoro resta in memoria e riparte da dove era. Una pausa molto lunga può far cadere la connessione con Claude: in quel caso la fase va in errore e si rilancia."

export function ControlloPausa({ job, compatto, className }: { job: JobFase | undefined | null; compatto?: boolean; className?: string }) {
  const { slug } = useGara()
  const { pausa, riprendi } = usePausaJob(slug)
  // In coda non c'è ancora un processo da sospendere.
  if (!job || job.stato !== "in_esecuzione") return null
  const inAttesa = !!job.pausa_richiesta || pausa.isPending || riprendi.isPending
  const errore = (cosa: string) => (e: unknown) => toast.error(cosa, { description: comeApiError(e).message })

  if (job.in_pausa) {
    return (
      <Button size={compatto ? "sm" : "default"} variant="outline" className={className} disabled={inAttesa}
        onClick={() => riprendi.mutate(job.id, { onError: errore("Ripresa non riuscita") })}>
        <PlayIcon aria-hidden="true" />{job.pausa_richiesta === "riprendi" ? "Ripresa in corso" : "Riprendi"}
      </Button>
    )
  }
  return (
    <Button size={compatto ? "sm" : "default"} variant="outline" className={className} disabled={inAttesa} title={NOTA_PAUSA}
      onClick={() => pausa.mutate(job.id, { onError: errore("Pausa non riuscita") })}>
      <PauseIcon aria-hidden="true" />{job.pausa_richiesta === "pausa" ? "Messa in pausa" : "Metti in pausa"}
    </Button>
  )
}

/** Riga di stato per un'attività in pausa. */
export function TestoPausa({ job }: { job: JobFase | undefined | null }) {
  if (!job?.in_pausa) return null
  return <>In pausa{job.pausa_dal ? ` ${quandoRelativo(job.pausa_dal)}` : ""}: nessun passaggio va avanti finché non riprendi.</>
}
