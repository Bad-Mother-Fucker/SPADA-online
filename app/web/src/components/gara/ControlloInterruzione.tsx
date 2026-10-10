// «Interrompi» su un'attività in corso (fase, deliverable), come il pulsante
// stop di Claude. Il worker termina i processi; lo script registra
// l'attività «interrotta» con la sua sessione di Claude, e «Riprendi»
// (cioè eseguirla di nuovo) continua da dove si era fermata invece di
// ripartire da zero (spada_comune.sh, sessione_interrotta).

import { StopIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useGara } from "./GaraContext"
import { useInterrompiJob } from "@/hooks/useGaraDati"
import { comeApiError } from "@/lib/risorsa"
import type { JobFase } from "@/dominio/fasi"

/** Cosa succede dopo, detto prima del clic. */
export const NOTA_INTERRUZIONE = "Interrompi ferma il lavoro subito. Quando riprendi, continua da dove si era fermato: quello che è già fatto non si rifà."

export function ControlloInterruzione({ job, compatto, className }: { job: JobFase | undefined | null; compatto?: boolean; className?: string }) {
  const { slug } = useGara()
  const interrompi = useInterrompiJob(slug)
  if (!job) return null
  const inAttesa = !!job.interruzione_richiesta || interrompi.isPending
  return (
    <Button size={compatto ? "sm" : "default"} variant="outline" className={className} disabled={inAttesa} title={NOTA_INTERRUZIONE}
      onClick={() => interrompi.mutate(job.id, { onError: (e) => toast.error("Interruzione non riuscita", { description: comeApiError(e).message }) })}>
      <StopIcon weight="fill" aria-hidden="true" />
      {inAttesa ? "Interruzione in corso" : job.stato === "in_coda" ? "Togli dalla coda" : "Interrompi"}
    </Button>
  )
}
