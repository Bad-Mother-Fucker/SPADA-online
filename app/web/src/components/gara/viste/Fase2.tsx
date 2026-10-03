import { useState } from "react"
import { Link } from "react-router"
import { GraphIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Card, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { PannelloFase } from "../PannelloFase"
import { useGara } from "../GaraContext"
import { useCriteri, useGap, useProposte } from "@/hooks/useGaraDati"
import { risorsa } from "@/lib/risorsa"
import { coperturaCriteri, type Copertura, type Criterio } from "@/dominio/registri"
import { cn } from "@/lib/utils"

function contaProvenienza(righe: Criterio[]) {
  const m = new Map<string, number>()
  for (const r of righe) {
    const f = (r.fonte || "").split("·")[0].trim() || "non indicata"
    m.set(f, (m.get(f) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
}

function RigaRequisito({ r, c }: { r: Criterio; c: Copertura }) {
  const tono = c.stato === "coperto" ? "ok" : c.stato === "scoperto" ? "attn" : "neu"
  return (
    <article className={cn("grid grid-cols-[52px_1fr_auto] items-start gap-3 rounded-md border px-3 py-2", c.stato === "scoperto" && "border-status-attn/40")}>
      <span className="font-mono text-xs text-foreground-2">{r.id || "n.d."}</span>
      <div className="min-w-0">
        <div className="text-sm">{r.testo || "(testo non riportato nel registro)"}</div>
        {(r.punti || c.dettaglio) && <div className="mt-0.5 text-micro text-muted-foreground">{[r.punti ? `${r.punti} punti` : "", c.dettaglio].filter(Boolean).join(", ")}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {r.metodo && <Chip tono={r.metodo === "tabellare" ? "run" : undefined}>{r.metodo}</Chip>}
        <BadgeStato tono={tono}>{c.etichetta}</BadgeStato>
      </div>
    </article>
  )
}

export function Fase2() {
  const { slug, gara } = useGara()
  const criteri = useCriteri(slug)
  const gap = useGap(slug)
  const proposte = useProposte(slug)
  const r = risorsa(criteri, { vuoto: (d) => !d || d.length === 0, percorso: "03_criteria/criteria_matrix.md" })
  const [tutti, setTutti] = useState(false)

  const righe = criteri.data || []
  const copertura = coperturaCriteri(gap.data || [], proposte.data || [], gara.manifest.criteri_stato)
  const cop = righe.map((x) => copertura(x.id))
  const conteggi = {
    totale: righe.length,
    discrezionali: righe.filter((x) => x.metodo === "discrezionale").length,
    tabellari: righe.filter((x) => x.metodo === "tabellare").length,
    valutati: cop.filter((c) => c.stato !== "da_valutare").length,
    aperti: cop.filter((c) => c.stato === "scoperto").length,
  }
  const mostrate = tutti ? righe : righe.slice(0, 6)
  const provenienza = contaProvenienza(righe)

  return (
    <Split aside={
      <PannelloFase n={2} prima={
        <Card>
          <TitoloSezione>Provenienza</TitoloSezione>
          {provenienza.length ? (
            <dl className="space-y-1 text-xs">{provenienza.map(([f, n]) => <div key={f} className="flex justify-between gap-3"><dt className="min-w-0 truncate text-foreground-2" title={f}>{f}</dt><dd className="font-mono">{n}</dd></div>)}</dl>
          ) : <p className="text-xs text-muted-foreground">La provenienza compare quando i requisiti riportano il documento di origine.</p>}
          <p className="mt-3 border-t pt-3 text-micro text-muted-foreground">Ogni requisito conserva il riferimento puntuale, documento, articolo, pagina: è il vincolo che rende verificabile tutto ciò che la pipeline produce dopo.</p>
        </Card>
      } />
    }>
      {r.stato === "caricamento" && <Scheletro righe={5} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Matrice dei criteri non leggibile" errore={r.errore} percorso={r.errore.percorso || "criteria_matrix.md"} onRiprova={r.riprova} />}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Nessun requisito estratto" testo="La matrice dei criteri non è ancora stata prodotta. Si popola al termine della Fase 2. L'azione per questa fase è nel pannello a destra." /></Card>}
      {r.stato === "ok" && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Chip>Tutti {conteggi.totale}</Chip>
              {conteggi.discrezionali > 0 && <Chip>Discrezionali {conteggi.discrezionali}</Chip>}
              {conteggi.tabellari > 0 && <Chip>Tabellari {conteggi.tabellari}</Chip>}
              {!conteggi.valutati ? <Chip title="La copertura nasce in Fase 5 (registro dei gap) e in Fase 6 (proposte).">Copertura: si valuta dalla Fase 5</Chip>
                : conteggi.aperti ? <BadgeStato tono="crit">Con gap senza proposta {conteggi.aperti}</BadgeStato>
                : conteggi.valutati < conteggi.totale ? <BadgeStato tono="run">Coperti {conteggi.valutati}, da valutare {conteggi.totale - conteggi.valutati}</BadgeStato>
                : <BadgeStato tono="ok">Tutti coperti</BadgeStato>}
            </div>
            <Button size="sm" variant="outline" asChild><Link to="../grafo?filtro=requisito"><GraphIcon aria-hidden="true" />Apri nel Grafo, filtrato sui requisiti</Link></Button>
          </div>
          <div className="space-y-1.5">{mostrate.map((x) => <RigaRequisito key={x.id} r={x} c={copertura(x.id)} />)}</div>
          {righe.length > 6 && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setTutti((v) => !v)}>
              {tutti ? "Mostra solo i primi 6" : righe.length - 6 === 1 ? "Mostra l'altro requisito" : `Mostra gli altri ${righe.length - 6} requisiti`}
            </Button>
          )}
        </Card>
      )}
    </Split>
  )
}
