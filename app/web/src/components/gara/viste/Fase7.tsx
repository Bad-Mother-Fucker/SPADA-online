import { useState } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"
import { CheckIcon, CircleDashedIcon, DownloadSimpleIcon, TableIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Card, Kv, Nota, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { ControlloInterruzione } from "../ControlloInterruzione"
import { motivoBlocco } from "@/dominio/fasi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { DialogoConferma, type Conferma } from "../DialogoConferma"
import { PannelloFase } from "../PannelloFase"
import { TestataVista } from "../TestataVista"
import { useGara } from "../GaraContext"
import { fileDeliverable, tabellare, useContenutoDeliverable, useDeliverableAzioni, useDeliverables, type Deliverable } from "@/hooks/useGaraDati"
import { Api } from "@/lib/api"
import { plurale } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import type { Tono } from "@/dominio/fasi"

const STATO_DEL: Record<string, { tono: Tono; etichetta: string; azione: string }> = {
  individuato: { tono: "neu", etichetta: "Individuato", azione: "Apri scheda" },
  da_eseguire: { tono: "neu", etichetta: "In attesa di avvio", azione: "Apri workspace" },
  in_coda: { tono: "neu", etichetta: "In coda", azione: "Apri workspace" },
  in_esecuzione: { tono: "run", etichetta: "In lavorazione", azione: "Apri workspace" },
  interrotta: { tono: "attn", etichetta: "Interrotto", azione: "Apri workspace" },
  completata: { tono: "ok", etichetta: "Completato", azione: "Apri documento" },
  da_rivedere: { tono: "attn", etichetta: "Da approvare", azione: "Rivedi" },
  errore: { tono: "crit", etichetta: "Errore", azione: "Diagnostica" },
}
/** Stato mostrato: quello del backend (script + coda), più «individuato»
    finché la produzione è chiusa e il deliverable non è mai partito. */
const statoDel = (d: Deliverable, chiusa: boolean) => {
  if ((!d.stato || d.stato === "da_eseguire") && chiusa) return STATO_DEL.individuato
  return STATO_DEL[d.stato || ""] || STATO_DEL.da_eseguire
}
const inCorso = (d: Deliverable) => d.stato === "in_esecuzione" || d.stato === "in_coda"

function useAzioniDeliverable() {
  const { slug } = useGara()
  const az = useDeliverableAzioni(slug)
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const avvia = async (ids: string[]) => {
    const falliti: string[] = []
    for (const id of ids) {
      try { await az.esegui.mutateAsync(id) } catch (e) { falliti.push(`${id}: ${comeApiError(e).message}`) }
    }
    const ok = ids.length - falliti.length
    if (ok) toast.success(`${plurale(ok, "deliverable accodato", "deliverable accodati")}.`)
    falliti.forEach((f) => toast.error("Avvio non riuscito", { description: f }))
  }
  const riesegui = (id: string) => setConferma({
    titolo: `Rieseguire il deliverable ${id}?`, descrizione: "Il contenuto già prodotto viene rigenerato.", etichetta: "Riesegui",
    onConferma: () => az.riesegui.mutate(id, { onSuccess: () => toast.success(`Riesecuzione di ${id} accodata.`), onError: (e) => toast.error("Riesecuzione non riuscita", { description: comeApiError(e).message }) }),
  })
  return { avvia, riesegui, dialogo: <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />, inCorso: az.esegui.isPending || az.riesegui.isPending }
}

function CardDeliverable({ d, onAvvia, onRiesegui, blocco }: { d: Deliverable; onAvvia: () => void; onRiesegui: () => void; blocco: string | null }) {
  const { output } = useGara()
  const st = statoDel(d, !!blocco)
  const file = fileDeliverable(output, d)
  const prodotto = file.length > 0
  return (
    <article className="flex flex-col gap-2.5 rounded-lg border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <BadgeStato tono={st.tono} pulsa={d.stato === "in_esecuzione"}>{st.etichetta}</BadgeStato>
        <span className="font-mono text-micro text-muted-foreground">{d.id}</span>
      </div>
      <Link to={`deliverable/${encodeURIComponent(d.id)}`} className="rounded-sm">
        <span className="block text-sm font-semibold">{d.nome || d.id}</span>
        <span className="block text-xs text-foreground-2">{d.fonte || `criterio ${d.criterio}`}</span>
      </Link>
      <div className="flex flex-wrap gap-1.5"><Chip mono>{d.agente}</Chip><Chip>{d.tipo.replace(/_/g, " ")}</Chip>{d.vincolo_formato && <Chip>{d.vincolo_formato}</Chip>}</div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-2.5 text-micro text-muted-foreground">
        <span className="min-w-0 flex-1">{prodotto ? `${plurale(file.length, "file prodotto", "file prodotti")} in output` : "Nessun file ancora prodotto per questo deliverable"}</span>
        {tabellare(d) && <BadgeStato tono={prodotto ? "ok" : "neu"}>{prodotto ? <CheckIcon aria-hidden="true" /> : <CircleDashedIcon aria-hidden="true" />}{prodotto ? "Presente" : "Non prodotto"}</BadgeStato>}
        <AzioneDeliverable d={d} blocco={blocco} onAvvia={onAvvia} onRiesegui={onRiesegui} />
        <Button size="sm" variant="outline" asChild><Link to={`deliverable/${encodeURIComponent(d.id)}`}>{st.azione}</Link></Button>
      </div>
    </article>
  )
}

/** Avvia/Riesegui, Interrompi se gira o è in coda, Riprendi se interrotto.
    Con la produzione chiusa il pulsante resta visibile ma disattivato, col
    motivo: la scheda si consulta lo stesso. */
function AzioneDeliverable({ d, blocco, onAvvia, onRiesegui }: { d: Deliverable; blocco: string | null; onAvvia: () => void; onRiesegui: () => void }) {
  if (d.job) return <ControlloInterruzione job={d.job} compatto />
  if (inCorso(d)) return <Button size="sm" variant="outline" disabled title="Il deliverable è in coda: parte appena il worker è libero.">In coda</Button>
  // «Esegui» su un deliverable interrotto ne riprende la sessione.
  if (d.stato === "interrotta") return (
    <>
      <Button size="sm" variant="outline" disabled={!!blocco} title="Riparte dall'inizio: il contenuto già prodotto viene archiviato" onClick={onRiesegui}>Da capo</Button>
      <Button size="sm" disabled={!!blocco} title="Continua da dove si era fermato" onClick={onAvvia}>Riprendi</Button>
    </>
  )
  if (!d.stato || d.stato === "da_eseguire") return <Button size="sm" disabled={!!blocco} title={blocco || undefined} onClick={onAvvia}>Avvia</Button>
  return <Button size="sm" variant="outline" disabled={!!blocco} title={blocco || undefined} onClick={onRiesegui}>Riesegui</Button>
}

export function Fase7Elenco() {
  const { slug, gara } = useGara()
  const blocco = motivoBlocco(gara.fasi, 7)
  const q = useDeliverables(slug)
  const r = risorsa(q, { vuoto: (l) => l.length === 0, percorso: `/gare/${slug}/deliverables` })
  const { avvia, riesegui, dialogo, inCorso } = useAzioniDeliverable()
  const lista = q.data || []
  const pronti = blocco ? [] : lista.filter((d) => !d.stato || d.stato === "da_eseguire")
  return (
    <Split aside={<PannelloFase n={7} />}>
      {r.stato === "caricamento" && <Scheletro righe={5} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Elenco dei deliverable non leggibile" errore={r.errore} percorso={`/gare/${slug}/deliverables`} onRiprova={r.riprova} />}
      {r.stato === "assente" && <Card><VuotoInline titolo="Questa vista richiede un backend più recente" testo="Il servizio non espone i deliverable per tipo. Riavvia l'app con ./spada riavvia per caricare il backend aggiornato." /></Card>}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Nessun deliverable richiesto" testo="L'elenco è ricavato dal manifesto della gara, che la pipeline compila in Fase 3. Non è un modello fisso: dipende da cosa chiede questo disciplinare. L'azione per questa fase è nel pannello a destra." /></Card>}
      {r.stato === "ok" && (
        <>
          {blocco && (
            <Nota tono="neu" titolo="Elenco consultabile, produzione non ancora disponibile">
              L'analisi del disciplinare ha individuato i deliverable richiesti: puoi leggerli e aprirne le schede. {blocco.replace(/^Si sblocca/, "La produzione si sblocca")}
            </Nota>
          )}
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm text-foreground-2">L'elenco è ricavato dal disciplinare di questa gara, non è un modello fisso: sono richiesti <b className="font-semibold text-foreground">{plurale(lista.length, "deliverable", "deliverable")}</b>. Ognuno ha agente e skill propri e può essere avviato per conto suo.</p>
            {pronti.length > 0 && <Button disabled={inCorso} onClick={() => avvia(pronti.map((d) => d.id))}>{pronti.length === 1 ? "Avvia il deliverable pronto" : `Avvia i ${pronti.length} pronti`}</Button>}
          </Card>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {lista.map((d) => <CardDeliverable key={d.id} d={d} blocco={blocco} onAvvia={() => avvia([d.id])} onRiesegui={() => riesegui(d.id)} />)}
          </div>
        </>
      )}
      {dialogo}
    </Split>
  )
}

export function Fase7Workspace() {
  const { slug, gara, output } = useGara()
  const { id = "" } = useParams()
  const q = useDeliverables(slug)
  const { avvia, riesegui, dialogo } = useAzioniDeliverable()
  const d = (q.data || []).find((x) => x.id === id) || null
  const file = d ? fileDeliverable(output, d) : []
  const md = file.find((p) => p.endsWith(".md")) || null
  const contenuto = useContenutoDeliverable(slug, d && !tabellare(d) ? md : null)
  const prodotto = file.length > 0
  const blocco = motivoBlocco(gara.fasi, 7)
  const st = d ? statoDel(d, !!blocco) : STATO_DEL.da_eseguire
  const testata = <TestataVista kicker={`Fase 7, workspace ${id}`} titolo={d?.nome || id} sottotitolo={d ? `${d.tipo.replace(/_/g, " ")}, ${d.agente}` : "Deliverable non trovato fra quelli richiesti."} badge={d ? { tono: prodotto ? "ok" : "neu", etichetta: prodotto ? "Prodotto" : "Non ancora prodotto" } : undefined} indietro={{ a: "../fase/7", etichetta: "Tutti i deliverable" }} />

  if (q.isPending) return <>{testata}<Scheletro righe={4} /></>
  if (!d) return <>{testata}<Card><VuotoInline titolo="Deliverable non trovato" testo={`Nessun deliverable con id ${id} nel manifesto della gara.`} azione={<Button variant="outline" asChild><Link to="../fase/7">Torna a tutti i deliverable</Link></Button>} /></Card></>

  return (
    <>
      {testata}
      <Split aside={
        <>
          <Card>
            <TitoloSezione>Assegnazione</TitoloSezione>
            <Kv voci={[["Agente", d.agente, true], ["Tipo", d.tipo.replace(/_/g, " ")], ["Criterio", d.criterio, true], ["Fonte", d.fonte || "non indicata"], ["Vincolo", d.vincolo_formato || "nessuno dichiarato"], ["Modello", gara.manifest.esecuzione?.modello || "n.d.", true]]} />
            <Button size="sm" variant="outline" className="mt-3 w-full" asChild><Link to="../impostazioni">Cambia modello o effort</Link></Button>
          </Card>
          <Card tono={prodotto ? "ok" : "attn"}>
            <strong className="block text-xs font-semibold">{prodotto ? "Entra nel plico" : "Manca al plico"}</strong>
            <p className="text-micro text-foreground-2">{prodotto ? "Il documento è prodotto: entra nel plico così com'è, salvo riesecuzione esplicita." : "Finché questo deliverable non produce un file, la Fase 8 resta incompleta."}</p>
          </Card>
        </>
      }>
        <Card tono={st.tono}>
          <TitoloSezione azioni={
            <div className="flex flex-wrap gap-1.5">
              <AzioneDeliverable d={d} blocco={blocco} onAvvia={() => avvia([d.id])} onRiesegui={() => riesegui(d.id)} />
              {file.slice(0, 3).map((p) => <Button key={p} size="sm" variant="outline" asChild><a href={Api.percorsoOutput(slug, p)} target="_blank" rel="noopener"><DownloadSimpleIcon aria-hidden="true" />.{p.split(".").pop()}</a></Button>)}
            </div>
          }>{prodotto ? "Output prodotto" : "Output non ancora prodotto"}</TitoloSezione>
          {tabellare(d) ? (
            <div className="flex gap-3 rounded-md border bg-background p-3">
              <TableIcon size={18} className="shrink-0 text-foreground-2" aria-hidden="true" />
              <div className="min-w-0 text-xs">
                <strong className="block font-semibold">{prodotto ? "Presente" : "Non ancora prodotto"}</strong>
                <span className="text-foreground-2">Contenuto tabellare: non viene anteprimato in pagina. Si verifica la presenza; il merito si controlla sul file, e in Fase 8 se ne verifica solo la consegnabilità.</span>
                <Kv className="mt-2" voci={[["Tipo", d.tipo.replace(/_/g, " ")], ["File", String(file.length)]]} />
              </div>
            </div>
          ) : !md ? (
            <VuotoInline titolo={prodotto ? "Documento senza contenuto leggibile" : "Documento non ancora scritto"} testo={prodotto ? "Il file esiste ma non contiene prosa che si possa anteprimare." : "Il file compare quando questo deliverable viene eseguito."} />
          ) : contenuto.isPending ? <Scheletro righe={5} className="border-0 p-0" /> : contenuto.isError ? (
            <StatoErrore titolo="Documento non leggibile" errore={comeApiError(contenuto.error)} percorso={md} onRiprova={() => void contenuto.refetch()} />
          ) : !contenuto.data ? (
            <VuotoInline titolo="Documento senza contenuto leggibile" testo="Il file esiste ma non contiene prosa che si possa anteprimare." />
          ) : (
            <div className="space-y-2 rounded-md border bg-background p-4 text-sm leading-[1.6] text-foreground-2">
              {contenuto.data.paragrafi.map((p, i) => p.titolo ? <h4 key={i} className="mt-3 text-sm font-semibold text-foreground first:mt-0">{p.titolo}</h4> : <p key={i}>{p.testo}</p>)}
            </div>
          )}
        </Card>
        {contenuto.data?.sezioni.length ? (
          <Card>
            <TitoloSezione>Struttura del documento</TitoloSezione>
            <div className="space-y-1">
              {contenuto.data.sezioni.map((s) => (
                <div key={s.titolo} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                  <CheckIcon size={12} className="text-status-ok" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{s.titolo}</span>
                  <span className="font-mono text-micro text-muted-foreground">{s.parole} parole</span>
                  <BadgeStato tono="ok">presente</BadgeStato>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </Split>
      {dialogo}
    </>
  )
}
