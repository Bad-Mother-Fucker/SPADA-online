import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { Card, Scheletro, Split, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { PannelloFase } from "../PannelloFase"
import { useGara } from "../GaraContext"
import { DocumentoReso } from "./Documento"
import { useAnalisi } from "@/hooks/useGaraDati"
import { risorsa } from "@/lib/risorsa"

/** L'audit strategico per intero: le quattro analisi con la loro
    classificazione e il riepilogo. Domande e indicazioni del professionista
    non stanno più qui: si raccolgono nella Fase 4. */
export function Fase3() {
  const { slug } = useGara()
  const analisi = useAnalisi(slug)
  const r = risorsa(analisi, { vuoto: (d) => !d, percorso: "03_criteria/strategy_audit.md" })
  return (
    <Split larga aside={
      <PannelloFase n={3} prima={
        <Card>
          <h3 className="mb-1 text-sm font-semibold">Domande e indicazioni</h3>
          <p className="mb-3 text-xs text-foreground-2">Le domande strategiche dell'audit vanno nel registro unico, con quelle del disciplinare e degli elaborati. Risposte e indicazioni, tono e priorità per criterio, si danno nella Fase 4.</p>
          <Button size="sm" variant="outline" className="w-full" asChild><Link to="../fase/4">Vai alle domande, Fase 4</Link></Button>
        </Card>
      } />
    }>
      {r.stato === "caricamento" && <Scheletro righe={6} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Audit strategico non leggibile" errore={r.errore} percorso="03_criteria/strategy_audit.md" onRiprova={r.riprova} />}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Audit strategico non ancora prodotto" testo="Compare al termine della Fase 3: budget sicurezza, gap prezzi rispetto al prezzario, viabilità del cantiere, capacità di investimento migliorativo. Solo dati, nessuna raccomandazione. L'azione per questa fase è nel pannello a destra." /></Card>}
      {r.stato === "ok" && analisi.data && (
        <DocumentoReso doc={analisi.data} kicker="Audit strategico" conClassificazione percorsoHtml="11_view/03_criteria/strategy_audit.html" percorsoMd="03_criteria/strategy_audit.md" />
      )}
    </Split>
  )
}
