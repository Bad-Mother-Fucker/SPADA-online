// Le azioni disponibili su una fase, derivate dal suo stato reale. Sono le
// stesse in tutte le viste di fase: l'operatore non deve chiedersi dove sia
// finito il bottone di avvio.

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DialogoConferma, type Conferma } from "./DialogoConferma"
import { useGara } from "./GaraContext"
import { useAzioniFase } from "@/hooks/useGaraDati"
import { comeApiError } from "@/lib/risorsa"
import { GATE_UMANO, fase, motivoBlocco, statoFase } from "@/dominio/fasi"
import { cn } from "@/lib/utils"

export function useEsegui() {
  const { slug } = useGara()
  const az = useAzioniFase(slug)
  const esito = (ok: string, errore: string) => ({
    onSuccess: () => toast.success(ok),
    onError: (e: unknown) => toast.error(errore, { description: comeApiError(e).message }),
  })
  return {
    esegui: (n: number) => az.esegui.mutate(n, esito(`Fase ${n} accodata.`, "Avvio non riuscito")),
    riesegui: (n: number) => az.riesegui.mutate(n, esito(`Riesecuzione della Fase ${n} accodata.`, "Riesecuzione non riuscita")),
    approva: (n: number) => az.approva.mutate(n, esito(`Checkpoint della Fase ${n} approvato.`, "Approvazione non riuscita")),
    inCorso: az.esegui.isPending || az.riesegui.isPending || az.approva.isPending,
  }
}

export interface AzionePrimaria { etichetta: string; onClick: () => void; disabilitata?: boolean; titolo?: string }

export function AzioniFase({ n, blocco, className, azionePrimaria }: { n: number; blocco?: string | null; className?: string; azionePrimaria?: AzionePrimaria }) {
  const { gara } = useGara()
  const st = statoFase(gara.fasi, n)
  const f = fase(n)
  const { esegui, riesegui, approva, inCorso } = useEsegui()
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const motivo = motivoBlocco(gara.fasi, n) || blocco || null

  const chiediRiesecuzione = () => {
    if (st === "completata") {
      setConferma({
        titolo: `Rieseguire la Fase ${n}?`,
        descrizione: "Le fasi successive già completate verranno marcate come da rivedere, non cancellate.",
        etichetta: "Riesegui la fase",
        onConferma: () => riesegui(n),
      })
    } else riesegui(n)
  }

  let corpo: React.ReactNode
  if (azionePrimaria) {
    // La vista sa meglio del pannello cosa significa "eseguire" (Fase 4:
    // salvare e inviare le risposte): il pulsante è il suo.
    corpo = <Button className="w-full" disabled={azionePrimaria.disabilitata || inCorso} title={azionePrimaria.titolo || ""} onClick={azionePrimaria.onClick}>{azionePrimaria.etichetta}</Button>
  } else if (st === "in_coda") {
    corpo = <Button className="w-full" disabled={!!motivo || inCorso} title={motivo || ""} onClick={() => esegui(n)}>Avvia Fase {n}, {f.titolo.toLowerCase()}</Button>
  } else if (st === "da_rivedere" && GATE_UMANO.has(n)) {
    corpo = (
      <>
        <Button className="w-full" disabled={inCorso} onClick={() => approva(n)}>Approva il checkpoint e prosegui</Button>
        <Button className="w-full" variant="outline" disabled={inCorso} onClick={chiediRiesecuzione}>Riesegui la fase</Button>
      </>
    )
  } else if (st === "errore" || st === "da_rivedere") {
    corpo = <Button className="w-full" disabled={inCorso} onClick={chiediRiesecuzione}>Riesegui la fase</Button>
  } else if (st === "completata") {
    corpo = <Button className="w-full" variant="outline" disabled={inCorso} onClick={chiediRiesecuzione}>Riesegui la fase</Button>
  } else {
    corpo = (
      <p className="flex items-center justify-center gap-2 text-sm text-status-run">
        <i className="size-1.5 rounded-full bg-current animate-pulsa" aria-hidden="true" />Esecuzione in corso
      </p>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {corpo}
      <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />
    </div>
  )
}
