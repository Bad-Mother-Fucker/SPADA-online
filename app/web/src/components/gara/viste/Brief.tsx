import { Link } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, Nota, Scheletro, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { TestataVista } from "../TestataVista"
import { useGara } from "../GaraContext"
import { DocumentoReso } from "./Documento"
import { useGaraBrief, useRiallineaBrief } from "@/hooks/useGaraDati"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { statoFase } from "@/dominio/fasi"

/** Il documento di sintesi: nasce in Fase 1 dal disciplinare e si aggiorna
    a ogni fase e a ogni documento integrato; le sezioni sono sempre le
    stesse e ciascuna dice quando è stata aggiornata. */
export function Brief() {
  const { slug, gara } = useGara()
  const brief = useGaraBrief(slug)
  const riallinea = useRiallineaBrief(slug)
  const r = risorsa(brief, { vuoto: (d) => !d, percorso: "03_criteria/gara_brief.md" })
  // Un brief scritto con il template precedente, senza lo storico degli
  // aggiornamenti, si riallinea con le fasi già eseguite.
  const vecchio = !!brief.data && !brief.data.sezioni.some((s) => s.titolo.toLowerCase().startsWith("storico aggiornamenti"))
  const f2 = statoFase(gara.fasi, 2) === "completata"
  return (
    <>
      <TestataVista kicker="Vista trasversale" titolo="Gara Brief" sottotitolo="Cosa chiede questa gara e cosa serve per vincerla. Nasce in Fase 1 dal disciplinare e si aggiorna a ogni fase e a ogni documento integrato: le sezioni sono sempre le stesse, ciascuna dice quando è stata aggiornata." badge={{ tono: "neu", etichetta: "Sempre disponibile" }} />
      {r.stato === "caricamento" && <Scheletro righe={6} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Gara brief non leggibile" errore={r.errore} percorso="03_criteria/gara_brief.md" onRiprova={r.riprova} />}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Gara brief non ancora prodotto" testo="Nasce in Fase 1 dal disciplinare, scadenze, punteggio, vincoli di formato, criteri, e si arricchisce a ogni fase: elaborati in Fase 2, audit in Fase 3, risposte del professionista in Fase 4." azione={<Button asChild><Link to="../fase/1">Vai alla Fase 1</Link></Button>} /></Card>}
      {r.stato === "ok" && brief.data && (
        <div className="space-y-4">
          {vecchio && f2 && (
            <Nota tono="attn" role="status" titolo="Brief scritto con la struttura precedente"
              azioni={<Button size="sm" variant="outline" disabled={riallinea.isPending} onClick={() => riallinea.mutate(undefined, {
                onSuccess: () => toast.success("Riallineamento accodato", { description: "Il brief si aggiorna e le sue domande passano alla Fase 4." }),
                onError: (e) => toast.error("Riallineamento non accodato", { description: comeApiError(e).message }),
              })}>{riallinea.isPending ? "Accodo" : "Riallinea il brief"}</Button>}>
              Non riporta ancora ciò che hanno prodotto le fasi successive alla Fase 1. Il riallineamento lo riscrive con le sezioni fisse e porta le sue domande nella Fase 4, senza rieseguire le fasi.
            </Nota>
          )}
          <DocumentoReso doc={brief.data} kicker="Gara Brief" conStatoSezione percorsoHtml="11_view/03_criteria/gara_brief.html" percorsoMd="03_criteria/gara_brief.md" />
        </div>
      )}
    </>
  )
}
