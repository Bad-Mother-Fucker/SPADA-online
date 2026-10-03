// Fase 1, acquisizione documenti: tre categorie, zona di rilascio,
// caricamento file per file con avanzamento, rifiuti con motivo, elenco
// dei documenti e prontezza all'avvio.

import { useCallback, useRef, useState, type DragEvent } from "react"
import { toast } from "sonner"
import { CheckIcon, UploadSimpleIcon, WarningIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Card, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato } from "@/components/gare/BadgeStato"
import { PannelloFase } from "../PannelloFase"
import { useGara } from "../GaraContext"
import { useEsegui } from "../AzioniFase"
import { useCaricamenti } from "@/hooks/useCaricamenti"
import { useDocumenti, useIntegraDocumento } from "@/hooks/useGaraDati"
import { comeApiError } from "@/lib/risorsa"
import { byte, plurale, quandoRelativo } from "@/lib/formato"
import { risorsa } from "@/lib/risorsa"
import type { Tono } from "@/dominio/fasi"
import { cn } from "@/lib/utils"
import { CATEGORIE, ESTENSIONI_AMMESSE, type Categoria } from "@/dominio/fasi"

function useZonaRilascio(onFile: (files: File[]) => void) {
  const [sopra, setSopra] = useState(false)
  return {
    sopra,
    props: {
      onDragOver: (e: DragEvent) => { e.preventDefault(); setSopra(true) },
      onDragLeave: () => setSopra(false),
      onDrop: (e: DragEvent) => { e.preventDefault(); setSopra(false); onFile([...e.dataTransfer.files]) },
    },
  }
}

/** Dove si trova un documento rispetto al contesto della gara (backend:
    routers/gare.py::_stato_contesto). "fase" = lo legge la Fase 2. */
const CONTESTO_DOC: Record<string, { tono: Tono; etichetta: string; aiuto: string }> = {
  da_integrare: { tono: "attn", etichetta: "non ancora nel contesto", aiuto: "Caricato dopo la Fase 2: integralo per portarlo nel grafo e nel brief." },
  in_coda: { tono: "run", etichetta: "integrazione in coda", aiuto: "Il worker lo integra appena finisce il job in corso." },
  in_corso: { tono: "run", etichetta: "integrazione in corso", aiuto: "Estrazione, grafo e brief in aggiornamento." },
  integrato: { tono: "ok", etichetta: "integrato nel contesto", aiuto: "Nel grafo e nel brief: vedi lo storico del brief." },
  errore: { tono: "crit", etichetta: "integrazione fallita", aiuto: "Vedi Attività per la causa." },
}

export function Fase1() {
  const { slug } = useGara()
  const docs = useDocumenti(slug)
  const integra = useIntegraDocumento(slug)
  const integraDoc = (percorso: string, nome: string) => integra.mutate(percorso, {
    onSuccess: () => toast.success(`${nome}: integrazione accodata.`, { description: "Grafo e brief si aggiornano senza rieseguire le fasi." }),
    onError: (e) => toast.error("Integrazione non accodata", { description: comeApiError(e).message }),
  })
  const r = risorsa(docs, { vuoto: (l) => l.length === 0, percorso: `/gare/${slug}/documenti` })
  const { riesegui } = useEsegui()
  const input = useRef<HTMLInputElement>(null)
  const [categoriaScelta, setCategoriaScelta] = useState<Categoria | null>(null)

  const suEsito = useCallback(({ caricati, fasiDaValutare }: { caricati: number; fasiDaValutare: number[] }) => {
    if (!caricati) return
    toast.success(`${plurale(caricati, "documento caricato", "documenti caricati")}.`)
    // Ingestione incrementale: un upload a gara avviata non rilancia nulla
    // da solo. Si propone quale fase rieseguire, senza deciderlo al posto
    // dell'operatore e senza farlo in silenzio.
    for (const n of fasiDaValutare) {
      toast.warning(`Rieseguire la Fase ${n} per tenere conto del nuovo documento?`, {
        description: "Le fasi successive già completate verranno marcate da rivedere, non cancellate.",
        duration: 30_000,
        action: { label: `Riesegui la Fase ${n}`, onClick: () => riesegui(n) },
        cancel: { label: "Non ora", onClick: () => {} },
      })
    }
  }, [riesegui])
  const { inCorso, rifiutati, carica, scarta } = useCaricamenti(slug, suEsito)

  const zona = useZonaRilascio((f) => carica(f, null))
  const scegli = (c: Categoria | null) => { setCategoriaScelta(c); input.current?.click() }

  const lista = docs.data || []
  const presente = (d: { presente?: boolean }) => d.presente !== false
  const perCategoria = (id: Categoria) => lista.filter((d) => d.categoria === id)
  const haDisciplinare = lista.some((d) => d.categoria === "disciplinare" && presente(d))
  const nElaborati = lista.filter((d) => d.categoria === "elaborati" && presente(d)).length
  const nP7m = lista.filter((d) => d.categoria === "p7m" && presente(d)).length
  const orfani = lista.filter((d) => d.presente === false).length

  const voce = (tono: "ok" | "attn" | "crit", testo: string) => (
    <li key={testo} className="flex items-start gap-2 text-xs">
      <span className={cn("mt-0.5 shrink-0", tono === "ok" ? "text-status-ok" : tono === "attn" ? "text-status-attn" : "text-status-crit")} aria-hidden="true">
        {tono === "ok" ? <CheckIcon size={12} weight="bold" /> : tono === "attn" ? <WarningIcon size={12} /> : <XIcon size={12} weight="bold" />}
      </span>
      <span className="text-foreground-2">{testo}</span>
    </li>
  )

  return (
    <Split aside={
      <PannelloFase n={1} blocco={haDisciplinare ? null : "Carica il disciplinare: senza, la Fase 1 non ha da cosa ricavare i requisiti."} prima={
        <Card tono={haDisciplinare ? "ok" : "attn"}>
          <h3 className="mb-2 text-sm font-semibold">{haDisciplinare ? "Pronto per l'avvio" : "Non ancora avviabile"}</h3>
          <ul className="space-y-1.5">
            {voce(haDisciplinare ? "ok" : "crit", haDisciplinare ? "Disciplinare presente" : "Disciplinare mancante: la Fase 1 non può partire")}
            {voce(nElaborati ? "ok" : "attn", nElaborati ? `${plurale(nElaborati, "elaborato tecnico caricato", "elaborati tecnici caricati")}` : "Nessun elaborato tecnico: l'analisi si baserà sul solo disciplinare")}
            {voce(nP7m ? "ok" : "attn", nP7m ? `${plurale(nP7m, "PDF firmato", "PDF firmati")} da verificare in fase di estrazione` : "Nessun P7M: nulla da verificare come firma")}
            {orfani > 0 && voce("attn", `${orfani} ${orfani === 1 ? "riga di documento" : "righe di documento"} senza file su disco: verifica la cartella input`)}
          </ul>
        </Card>
      } />
    }>
      <Card>
        <input ref={input} type="file" multiple className="hidden" accept={ESTENSIONI_AMMESSE.join(",")} onChange={(e) => { carica([...(e.target.files || [])], categoriaScelta); e.target.value = "" }} />
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {CATEGORIE.map((c) => {
            const n = perCategoria(c.id).length
            return <CategoriaDrop key={c.id} c={c} n={n} onScegli={() => scegli(c.id)} onFile={(f) => carica(f, c.id)} />
          })}
        </div>

        <button type="button" onClick={() => scegli(null)} {...zona.props}
          className={cn("flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors duration-(--d-fast)",
            zona.sopra ? "border-primary bg-primary-soft" : rifiutati.length ? "border-status-crit/50" : "border-border-strong hover:border-foreground-2 hover:bg-muted")}>
          <UploadSimpleIcon size={22} className="text-foreground-2" aria-hidden="true" />
          <span className="text-sm font-medium">{rifiutati.length ? plurale(rifiutati.length, "file non caricato", "file non caricati") : "Trascina qui i file, o rilasciali sulla categoria giusta"}</span>
          <span className="text-micro text-muted-foreground">{rifiutati.length ? "Rilascia di nuovo qui i file corretti: i validi restano caricati." : "PDF, PDF.P7M, XLSX, DOCX, di qualunque dimensione. La categoria viene indovinata dal nome ed è correggibile."}</span>
        </button>

        <TitoloSezione className="mt-5">File caricati</TitoloSezione>
        <div className="space-y-1.5">
          {inCorso.map((c) => (
            <RigaFile key={c.nome} tag={CATEGORIE.find((x) => x.id === c.categoria)?.tag || c.categoria} nome={c.nome} dimensione={c.dimensione}
              destra={<span className="w-28"><span className="block h-1 overflow-hidden rounded-[1px] bg-muted"><span className="block h-full bg-status-run transition-[width] duration-(--d-base)" style={{ width: `${Math.round(c.progresso * 100)}%` }} /></span><span className="mt-0.5 block text-right font-mono text-micro text-muted-foreground">{Math.round(c.progresso * 100)}%</span></span>} />
          ))}
          {rifiutati.map((x) => (
            <RigaFile key={`r-${x.nome}`} tono="crit" tag="" nome={x.nome} dimensione={x.dimensione}
              destra={<><BadgeStato tono="crit">{x.motivo}</BadgeStato><Button variant="ghost" size="icon-xs" aria-label={`Togli ${x.nome} dall'elenco`} onClick={() => scarta(x.nome)}><XIcon aria-hidden="true" /></Button></>} />
          ))}
          {r.stato === "caricamento" && <Scheletro righe={2} />}
          {r.stato === "errore" && r.errore && <StatoErrore titolo="Elenco dei documenti non leggibile" errore={r.errore} percorso={`/gare/${slug}/documenti`} onRiprova={r.riprova} inCorso={docs.isFetching} />}
          {r.stato === "vuoto" && inCorso.length === 0 && <VuotoInline titolo="Nessun documento caricato" testo="La Fase 1 non può partire senza almeno il disciplinare: è il documento da cui la pipeline ricava i requisiti." />}
          {r.stato === "ok" && lista.map((d) => {
            const mancante = d.presente === false
            const ctx = d.contesto ? CONTESTO_DOC[d.contesto] : undefined
            const daIntegrare = (d.contesto === "da_integrare" || d.contesto === "errore") && !mancante
            return (
              <RigaFile key={`${d.categoria}-${d.nome_file}`} tono={mancante || daIntegrare ? "attn" : "ok"} tag={CATEGORIE.find((c) => c.id === d.categoria)?.tag || d.categoria} nome={d.nome_file} dimensione={d.dimensione}
                destra={<>
                  {ctx && !mancante
                    ? <span title={d.errore_integrazione || ctx.aiuto}><BadgeStato tono={ctx.tono} pulsa={d.contesto === "in_corso"}>{ctx.etichetta}</BadgeStato></span>
                    : <BadgeStato tono={mancante ? "attn" : "ok"}>{mancante ? "file non più presente su disco" : `caricato ${quandoRelativo(d.caricato_il)}`}</BadgeStato>}
                  {daIntegrare && <Button size="sm" variant="outline" disabled={integra.isPending} title="Estrae il documento, lo aggiunge al grafo e aggiorna il brief, senza rieseguire le fasi." onClick={() => integraDoc(d.percorso, d.nome_file)}>{d.contesto === "errore" ? "Riprova l'integrazione" : "Integra nel contesto"}</Button>}
                </>} />
            )
          })}
        </div>
      </Card>
      <p className="text-micro text-muted-foreground">Puoi aggiungere documenti anche dopo l'avvio. Prima della Fase 2 entrano nel contesto con la Fase 2; dopo, ogni documento si integra da solo nel grafo, nel brief e nelle domande con «Integra nel contesto», senza rieseguire le fasi.</p>
    </Split>
  )
}

function CategoriaDrop({ c, n, onScegli, onFile }: { c: (typeof CATEGORIE)[number]; n: number; onScegli: () => void; onFile: (f: File[]) => void }) {
  const zona = useZonaRilascio(onFile)
  return (
    <button type="button" onClick={onScegli} {...zona.props}
      className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-3 py-3 text-center transition-colors duration-(--d-fast)", zona.sopra ? "border-primary bg-primary-soft" : "bg-card hover:border-border-strong hover:bg-muted")}>
      <span className="font-mono text-micro text-muted-foreground">{c.tag}</span>
      <span className="text-sm font-semibold">{c.label}</span>
      <span className="text-micro text-foreground-2">{c.hint}</span>
      <span className={cn("mt-1 text-micro", n ? "font-medium text-status-ok" : "text-muted-foreground")}>{n ? plurale(n, "file caricato", "file caricati") : "nessun file"}</span>
    </button>
  )
}

function RigaFile({ tag, nome, dimensione, destra, tono }: { tag: string; nome: string; dimensione?: number; destra: React.ReactNode; tono?: "ok" | "attn" | "crit" }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs", tono === "crit" && "border-status-crit/40", tono === "attn" && "border-status-attn/40")}>
      <span className="w-10 shrink-0 font-mono text-micro text-muted-foreground">{tag || "n.d."}</span>
      <span className="min-w-0 flex-1 truncate" title={nome}>{nome}</span>
      <span className="shrink-0 font-mono text-micro text-muted-foreground">{dimensione !== undefined ? byte(dimensione) : ""}</span>
      <span className="flex shrink-0 items-center gap-1.5">{destra}</span>
    </div>
  )
}
