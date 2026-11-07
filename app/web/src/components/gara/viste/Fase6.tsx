import { useState } from "react"
import { Link, useParams } from "react-router"
import { CheckIcon, GraphIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { DialogoConferma, type Conferma } from "../DialogoConferma"
import { BottoneScelta, Card, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { Blocchi } from "@/components/comuni/Markdown"
import { PannelloFase } from "../PannelloFase"
import { TestataVista } from "../TestataVista"
import { useGara } from "../GaraContext"
import { useEsegui, type AzionePrimaria } from "../AzioniFase"
import { ETICHETTA_SEV, Prove, TONO_SEV } from "./Fase5"
import { useAzioniPropostaProfessionista, useCriteri, useDettaglioProposta, useGap, useProposte, useProposteProfessionista } from "@/hooks/useGaraDati"
import { quandoBreve } from "@/lib/formato"
import { blocchi, type Decisione } from "@/lib/md"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import type { Proposta } from "@/dominio/registri"
import type { Tono } from "@/dominio/fasi"
import { corpoFase, STATO, statoFase } from "@/dominio/fasi"

const DEC: Record<Decisione, { tono: Tono; etichetta: string }> = {
  approvata: { tono: "ok", etichetta: "Approvata" },
  da_modificare: { tono: "attn", etichetta: "Da modificare" },
  scartata: { tono: "crit", etichetta: "Scartata" },
}

function RigaProposta({ p, d, nota, bloccata }: { p: Proposta; d: Decisione | null; nota: string; bloccata: boolean }) {
  const { decidi } = useGara()
  const tonoSev = p.severita ? TONO_SEV[p.severita] : null
  // «Da modificare» senza la nota non dice all'agente cosa cambiare: il
  // clic apre la nota, la decisione si registra solo col testo.
  const [scrivendo, setScrivendo] = useState(false)
  const [testo, setTesto] = useState("")
  const apriNota = () => { setTesto(nota); setScrivendo(true) }
  const salva = () => { decidi(p.id, "da_modificare", testo.trim()); setScrivendo(false) }
  const idNota = `nota-${p.id}`
  return (
    <article className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border bg-card p-3">
      <Link to={`proposta/${encodeURIComponent(p.id)}`} className="min-w-0 rounded-sm text-left">
        <span className="mb-0.5 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-micro text-muted-foreground">{p.id}</span>
          {tonoSev && p.severita && <BadgeStato tono={tonoSev}>{ETICHETTA_SEV[p.severita]}</BadgeStato>}
          {d && <BadgeStato tono={DEC[d].tono}>{DEC[d].etichetta}</BadgeStato>}
          {p.riferimento && <span className="font-mono text-micro text-muted-foreground">da {p.riferimento}</span>}
        </span>
        <span className="block text-sm font-semibold">{p.titolo || "(proposta senza titolo)"}</span>
        {p.sintesi && <span className="mt-0.5 block text-xs text-foreground-2">{p.sintesi}</span>}
      </Link>
      <div role="group" aria-label={`Decisione su ${p.id}`} className="flex shrink-0 flex-wrap items-start justify-end gap-1.5">
        <BottoneScelta tono="ok" attivo={d === "approvata"} disabled={bloccata} onClick={() => { setScrivendo(false); decidi(p.id, "approvata") }}><CheckIcon aria-hidden="true" />Approva</BottoneScelta>
        <BottoneScelta tono="attn" attivo={d === "da_modificare"} disabled={bloccata} aria-expanded={scrivendo} aria-controls={idNota} onClick={apriNota}>Da modificare</BottoneScelta>
        <BottoneScelta tono="crit" attivo={d === "scartata"} disabled={bloccata} onClick={() => { setScrivendo(false); decidi(p.id, "scartata") }}>Scarta</BottoneScelta>
        <Button size="sm" variant="ghost" asChild><Link to={`proposta/${encodeURIComponent(p.id)}`}>Dettaglio</Link></Button>
      </div>
      {scrivendo ? (
        <form id={idNota} className="col-span-2 space-y-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); if (testo.trim()) salva() }}>
          <Label htmlFor={`${idNota}-testo`}>Cosa deve cambiare in {p.id}?</Label>
          <Textarea id={`${idNota}-testo`} rows={3} autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="es. Togli la parte sulla recinzione, è già nel C4; limita il piano prove alla sola malta." />
          <p className="text-micro text-muted-foreground">La nota va all'agente così com'è, come vincolo di redazione della proposta.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!testo.trim()} title={testo.trim() ? "" : "Scrivi cosa cambiare"}>Salva la richiesta di modifica</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setScrivendo(false)}>Annulla</Button>
          </div>
        </form>
      ) : d === "da_modificare" && (
        <div className="col-span-2 flex flex-wrap items-start gap-2 border-t pt-2 text-xs">
          {nota
            ? <p className="min-w-0 flex-1 text-foreground-2"><span className="font-medium text-foreground">Da cambiare: </span>{nota}</p>
            : <p className="min-w-0 flex-1 text-status-crit">Manca la nota: senza, l'agente non sa cosa cambiare e la conferma resta bloccata.</p>}
          <Button size="sm" variant="outline" disabled={bloccata} onClick={apriNota}>{nota ? "Modifica la nota" : "Scrivi la nota"}</Button>
        </div>
      )}
    </article>
  )
}

const RE_SOTTO = /^C[0-9]+\.[0-9]+$/
const RE_GAP = /^G-C[0-9]+-[0-9]+$/
const VUOTA = { criterio: "", sottocriterio: "", gap_id: "", titolo: "", descrizione: "" }

/** Proposte scritte dal professionista: approvate da lui, alla conferma
    diventano schede del criterio e nodi del grafo come le altre. */
function ProposteProprie({ bloccata }: { bloccata: boolean }) {
  const { slug } = useGara()
  const q = useProposteProfessionista(slug)
  const criteri = useCriteri(slug)
  const { crea, elimina } = useAzioniPropostaProfessionista(slug)
  const r = risorsa(q, { vuoto: (l) => l.length === 0, percorso: `/gare/${slug}/proposte-professionista` })
  const [f, setF] = useState(VUOTA)
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const ids = (criteri.data || []).map((c) => c.id).filter((id) => /^C[0-9]+$/.test(id))
  const sotto = f.sottocriterio.trim().toUpperCase()
  const gap = f.gap_id.trim().toUpperCase()
  const errori = [
    !f.criterio && "scegli il criterio",
    sotto && !(RE_SOTTO.test(sotto) && sotto.startsWith(`${f.criterio}.`)) && `il sottocriterio deve essere del criterio scelto (es. ${f.criterio || "C1"}.1)`,
    gap && !RE_GAP.test(gap) && "il gap va scritto come G-C1-002",
    f.titolo.trim().length < 3 && "scrivi un titolo",
    f.descrizione.trim().length < 10 && "descrivi la proposta",
  ].filter(Boolean) as string[]
  const invia = () => crea.mutate({ criterio: f.criterio, sottocriterio: sotto || null, gap_id: gap || null, titolo: f.titolo.trim(), descrizione: f.descrizione.trim() }, {
    onSuccess: (p) => { toast.success(`${p.id} aggiunta`, { description: "Entra nel grafo e nei registri alla conferma delle decisioni." }); setF(VUOTA) },
    onError: (e) => toast.error("Proposta non aggiunta", { description: comeApiError(e).message }),
  })
  const chiediElimina = (id: string) => setConferma({
    titolo: `Togliere la proposta ${id}?`, descrizione: "Non è ancora entrata nel grafo: viene tolta e il testo non si recupera.", etichetta: "Togli la proposta",
    onConferma: () => elimina.mutate(id, { onSuccess: () => toast.success(`${id} tolta.`), onError: (e) => toast.error("Proposta non tolta", { description: comeApiError(e).message }) }),
  })

  return (
    <Card>
      <TitoloSezione azioni={<Chip>professionista</Chip>}>Le tue proposte</TitoloSezione>
      <p className="mb-3 text-xs text-foreground-2">Una proposta che gli agenti non hanno fatto. È approvata da te: alla conferma entra nella scheda del criterio, diventa un nodo del grafo e i deliverable la useranno. Non ha prove documentali raccolte dal sistema, quindi scrivi tu i riferimenti che servono.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (!errori.length) invia() }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="pp-criterio">Criterio</Label>
            <Select value={f.criterio || undefined} onValueChange={(v) => setF({ ...f, criterio: v })} disabled={bloccata}>
              <SelectTrigger id="pp-criterio" className="w-full font-mono"><SelectValue placeholder="Scegli" /></SelectTrigger>
              <SelectContent>{ids.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1"><Label htmlFor="pp-sotto">Sottocriterio, facoltativo</Label><Input id="pp-sotto" value={f.sottocriterio} disabled={bloccata} placeholder={`es. ${f.criterio || "C1"}.1`} className="font-mono" onChange={(e) => setF({ ...f, sottocriterio: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="pp-gap">Gap collegato, facoltativo</Label><Input id="pp-gap" value={f.gap_id} disabled={bloccata} placeholder="es. G-C1-002" className="font-mono" onChange={(e) => setF({ ...f, gap_id: e.target.value })} /></div>
        </div>
        <div className="grid gap-1"><Label htmlFor="pp-titolo">Titolo</Label><Input id="pp-titolo" value={f.titolo} disabled={bloccata} maxLength={200} onChange={(e) => setF({ ...f, titolo: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="pp-desc">La proposta</Label><Textarea id="pp-desc" rows={5} value={f.descrizione} disabled={bloccata} maxLength={8000} placeholder="Cosa si offre, su quali lavorazioni o voci di computo, con quale beneficio per la commissione." onChange={(e) => setF({ ...f, descrizione: e.target.value })} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={bloccata || !!errori.length || crea.isPending} title={bloccata ? "Conferma in corso: le proposte si aggiungono a conferma conclusa." : errori.length ? `Manca: ${errori.join(", ")}.` : ""}>{crea.isPending ? "Aggiunta in corso" : "Aggiungi la proposta"}</Button>
          {!bloccata && errori.length > 0 && (f.titolo || f.descrizione || f.criterio) && <span className="text-micro text-muted-foreground">Manca: {errori.join(", ")}.</span>}
        </div>
      </form>
      {r.stato === "caricamento" && <Scheletro righe={2} className="mt-4 border-0 p-0" />}
      {r.stato === "assente" && <p className="mt-4 text-xs text-muted-foreground">Il backend in esecuzione non gestisce ancora le proposte della Fase 6: riavvialo con ./spada riavvia.</p>}
      {r.stato === "errore" && r.errore && <p className="mt-4 text-xs text-status-crit">Elenco non leggibile: {r.errore.message} <Button size="sm" variant="ghost" onClick={r.riprova}>Riprova</Button></p>}
      {r.stato === "ok" && (
        <div className="mt-4 space-y-1.5">
          {(q.data || []).map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-micro text-muted-foreground">{p.id}</span>
                  <BadgeStato tono={p.elaborata ? "ok" : "attn"}>{p.elaborata ? "Nel grafo" : "Entra alla conferma"}</BadgeStato>
                  {p.sottocriterio && <span className="font-mono text-micro text-muted-foreground">{p.sottocriterio}</span>}
                  {p.gap_id && <span className="font-mono text-micro text-muted-foreground">da {p.gap_id}</span>}
                </span>
                <span className="block text-sm font-semibold">{p.titolo}</span>
                <span className="mt-0.5 line-clamp-3 block whitespace-pre-line text-xs text-foreground-2">{p.descrizione}</span>
              </div>
              {!p.elaborata && <Button size="sm" variant="ghost" disabled={bloccata || elimina.isPending} onClick={() => chiediElimina(p.id)}>Togli</Button>}
            </div>
          ))}
        </div>
      )}
      <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />
    </Card>
  )
}

export function Fase6Elenco() {
  const { slug, gara, decisioni, storicoDecisioni } = useGara()
  const q = useProposte(slug)
  const r = risorsa(q, { vuoto: (d) => !d || d.length === 0, percorso: "06_registers/proposal_register.md" })
  const { approva, inCorso } = useEsegui()
  const [tutte, setTutte] = useState(false)
  const righe = q.data || []
  // Solo le decisioni del professionista: lo «stato audit» del registro
  // (approvata, con riserva) è il giudizio dell'auditor, non una decisione.
  const decisioneDi = (p: Proposta) => decisioni[p.id] || null
  const notaDi = (id: string) => [...storicoDecisioni].reverse().find((x) => x.riferimento === id)?.nota?.trim() || ""
  const decise = righe.filter((p) => decisioneDi(p)).length
  const senzaNota = righe.filter((p) => decisioneDi(p) === "da_modificare" && !notaDi(p.id)).map((p) => p.id)
  const pronta = righe.length > 0 && decise === righe.length && senzaNota.length === 0
  const pct = righe.length ? Math.round((decise / righe.length) * 100) : 0
  const mostrate = tutte ? righe : righe.slice(0, 4)
  const st6 = statoFase(gara.fasi, 6)
  const occupata = st6 === "in_esecuzione"
  const proprie = useProposteProfessionista(slug)
  const nProprie = (proprie.data || []).filter((p) => !p.elaborata).length
  const motivo = decise < righe.length
    ? `Mancano ${righe.length - decise} decisioni: ogni proposta deve essere approvata, da modificare o scartata.`
    : senzaNota.length ? `Scrivi nel dettaglio cosa cambiare per ${senzaNota.join(", ")}.` : ""
  const conferma: AzionePrimaria = {
    etichetta: st6 === "completata" ? "Conferma di nuovo le decisioni" : "Conferma l'approvazione delle proposte",
    onClick: () => approva(6),
    disabilitata: !pronta || occupata,
    titolo: motivo,
  }

  return (
    <Split aside={<PannelloFase n={6} azionePrimaria={occupata ? undefined : conferma} />}>
      {r.stato === "caricamento" && <Scheletro righe={5} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Registro delle proposte non leggibile" errore={r.errore} percorso="06_registers/proposal_register.md" onRiprova={r.riprova} />}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Nessuna proposta da rivedere" testo="Il registro delle proposte si popola in Fase 6, a partire dai gap trattati in Fase 5. L'azione per questa fase è nel pannello a destra." /></Card>}
      {r.stato === "ok" && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <div className="min-w-[200px] flex-1">
              <div className="mb-1 flex justify-between text-xs"><span className="text-foreground-2">Proposte decise</span><span className="font-mono font-medium">{decise} / {righe.length}</span></div>
              <div className="h-1 overflow-hidden rounded-[1px] bg-muted"><div className="h-full bg-status-ok transition-[width] duration-(--d-move) ease-(--e-move)" style={{ width: `${pct}%` }} /></div>
            </div>
            <Button disabled={conferma.disabilitata || inCorso} title={motivo} onClick={conferma.onClick}>{occupata ? "Conferma in corso" : conferma.etichetta}</Button>
          </div>
          <p className="mb-3 text-xs text-foreground-2">
            {motivo || `La conferma scrive le tue decisioni${nProprie ? ` e ${nProprie === 1 ? "la tua proposta" : `le tue ${nProprie} proposte`}` : ""} nelle schede dei criteri, aggiorna grafo, registri e brief un criterio alla volta (qualche minuto ciascuno) e compila budget e strategia della relazione nei vincoli dell'offerta. Poi i deliverable della Fase 7 si sbloccano e li avvii uno per uno.`}
          </p>
          <p className="mb-3 text-micro text-muted-foreground">Le azioni per riga servono ai casi ovvi; per leggere il contenuto completo, i gap di origine e lo storico delle note, apri il dettaglio.</p>
          <div className="space-y-2">{mostrate.map((p) => <RigaProposta key={p.id} p={p} d={decisioneDi(p)} nota={notaDi(p.id)} bloccata={occupata} />)}</div>
          {righe.length > 4 && <Button size="sm" variant="outline" className="mt-3" onClick={() => setTutte((v) => !v)}>{tutte ? "Mostra solo le prime 4" : righe.length - 4 === 1 ? "Mostra l'altra proposta" : `Mostra le altre ${righe.length - 4} proposte`}</Button>}
        </Card>
      )}
      {r.stato !== "caricamento" && <ProposteProprie bloccata={occupata} />}
    </Split>
  )
}

export function Fase6Dettaglio() {
  const { slug, gara, decisioni, storicoDecisioni, decidi } = useGara()
  const { id = "" } = useParams()
  const proposte = useProposte(slug)
  const gap = useGap(slug)
  const nodo = useDettaglioProposta(slug, id)
  // La nota parte dall'ultima registrata: modificarla non obbliga a riscriverla.
  const [bozza, setBozza] = useState<string | null>(null)
  const notaUltima = [...storicoDecisioni].reverse().find((x) => x.riferimento === id)?.nota?.trim() || ""
  const nota = bozza ?? notaUltima
  const setNota = setBozza
  const rn = risorsa(nodo, { percorso: `/gare/${slug}/proposte/${id}` })

  let p = (proposte.data || []).find((x) => x.id === id) || null
  if (!p && nodo.data) {
    const fm = nodo.data.frontmatter as Record<string, string | undefined>
    p = { id, titolo: fm.titolo || id, criterio: fm.criterio || "", riferimento: fm.sottocriterio || "", sintesi: "", severita: null, punteggio: String(fm.punteggio_stimato ?? ""), agente: "", decisione: null }
  }
  const st6 = STATO[statoFase(gara.fasi, 6)]
  const testata = <TestataVista kicker={`Fase 6, dettaglio proposta ${id}`} titolo={p?.titolo || id} sottotitolo="Contenuto integrale, gap di origine con le prove collegate e storico delle decisioni: tutto ciò che serve per decidere senza aprire gli elaborati." badge={{ tono: st6.tono, etichetta: st6.etichetta }} indietro={{ a: "../fase/6", etichetta: "Tutte le proposte" }} />

  if (!p) {
    if (proposte.isPending || nodo.isPending) return <>{testata}<Scheletro righe={4} /></>
    return <>{testata}<Card><VuotoInline titolo="Proposta non trovata" testo={`Nessuna proposta con identificativo ${id}, né nel registro né fra i nodi del grafo.`} azione={<Button variant="outline" asChild><Link to="../fase/6">Torna a tutte le proposte</Link></Button>} /></Card></>
  }
  const d = decisioni[p.id] || null
  const g = (gap.data || []).find((x) => x.id === p!.riferimento || x.proposta === p!.id)
  const corpo6 = corpoFase(gara.fasi, 6) || {}
  const voci = [
    ...(corpo6.conclusa_il ? [{ cosa: "Proposta generata", chi: "pipeline, Fase 6", quando: quandoBreve(String(corpo6.conclusa_il)), tono: "run" as Tono, nota: null as string | null }] : []),
    ...storicoDecisioni.filter((x) => x.riferimento === p!.id).map((x) => ({ cosa: DEC[x.decisione].etichetta, chi: "operatore", quando: quandoBreve(x.quando), tono: DEC[x.decisione].tono, nota: x.nota })),
  ]
  const fm = (nodo.data?.frontmatter || {}) as Record<string, unknown> & { evidence_documents?: { doc?: string; sezione?: string; estratto?: string }[] }
  // Prima della conferma la proposta non è ancora un nodo: testo e prove vengono dalla scheda del criterio (Fase 5).
  const daScheda = nodo.data?.fonte === "output_criterio"

  return (
    <>
      {testata}
      <Split larga aside={
        <>
          <Card tono="attn">
            <h3 className="mb-2 text-sm font-semibold">Decisione</h3>
            <div className="mb-3 grid gap-1.5">
              <BottoneScelta tono="ok" attivo={d === "approvata"} className="h-8 justify-start" onClick={() => decidi(p!.id, "approvata", nota || null)}><CheckIcon aria-hidden="true" />Approva così com'è</BottoneScelta>
              <BottoneScelta tono="attn" attivo={d === "da_modificare"} className="h-8 justify-start" disabled={!nota.trim()} title={nota.trim() ? "" : "Scrivi prima, qui sotto, cosa deve cambiare"} onClick={() => decidi(p!.id, "da_modificare", nota.trim())}>Rimanda con richiesta di modifica</BottoneScelta>
              <BottoneScelta tono="crit" attivo={d === "scartata"} className="h-8 justify-start" onClick={() => decidi(p!.id, "scartata", nota || null)}>Scarta la proposta</BottoneScelta>
            </div>
            <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota per la decisione" placeholder={d === "da_modificare" ? "Cosa deve cambiare? Obbligatorio per il rimando" : "Nota per lo storico, facoltativa"} />
            <p className="mt-1.5 text-micro text-muted-foreground">Per il rimando la nota è obbligatoria: va all'agente come vincolo di redazione. Con le altre decisioni entra solo nello storico.</p>
          </Card>
          <Card>
            <TitoloSezione>Storico decisioni</TitoloSezione>
            {voci.length ? (
              <ol className="space-y-2">
                {voci.map((v, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", { ok: "bg-status-ok", attn: "bg-status-attn", crit: "bg-status-crit", run: "bg-status-run", neu: "bg-status-neu" }[v.tono])} aria-hidden="true" />
                    <span className="min-w-0"><span className="block font-medium">{v.cosa}</span><span className="block text-micro text-muted-foreground">{v.chi}, {v.quando}</span>{v.nota && <span className="mt-0.5 block text-foreground-2">{v.nota}</span>}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-xs text-muted-foreground">Nessuna decisione registrata su questa proposta in questa sessione. Le decisioni precedenti restano nel registro di gara.</p>}
          </Card>
        </>
      }>
        {rn.stato === "caricamento" ? <Scheletro righe={4} /> : rn.stato === "ok" && nodo.data ? (
          <Card>
            <TitoloSezione>Contenuto della proposta</TitoloSezione>
            {daScheda && <p className="mb-3 text-micro text-muted-foreground">Testo integrale dalla scheda del criterio {String(fm.criterio || "")} (Fase 5). Diventa un nodo del grafo alla conferma della revisione.</p>}
            <Blocchi blocchi={blocchi(nodo.data.corpo)} />
            <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
              {typeof fm.criterio === "string" && fm.criterio && <Chip>criterio {fm.criterio}</Chip>}
              {typeof fm.sottocriterio === "string" && fm.sottocriterio && <Chip>{fm.sottocriterio}</Chip>}
              {fm.punteggio_stimato !== undefined && <Chip>{String(fm.punteggio_stimato)} punti stimati</Chip>}
              {typeof fm.confidence === "string" && fm.confidence && <Chip mono>confidence: {fm.confidence}</Chip>}
              {typeof fm.stato === "string" && fm.stato && <BadgeStato tono="ok">{fm.stato}</BadgeStato>}
              {typeof fm.audit === "string" && fm.audit && <BadgeStato tono={/integrare|respint|scart/i.test(fm.audit) ? "attn" : "ok"}>audit: {fm.audit}</BadgeStato>}
            </div>
            {(fm.evidence_documents || []).length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold">{daScheda ? "Prove documentali della proposta" : "Prove documentali del nodo"}</h4>
                <Prove prove={(fm.evidence_documents || []).map((e) => ({ fonte: `${e.doc || "documento"}${e.sezione ? `, ${e.sezione}` : ""}`, testo: e.estratto || "", contraria: false }))} vuoto="" />
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <TitoloSezione>Contenuto della proposta</TitoloSezione>
            <p className="text-sm text-foreground-2">{p.sintesi || "Il registro riporta questa proposta senza un contenuto esteso."}</p>
            <p className="mt-2 text-micro text-muted-foreground">Questa è la sintesi del registro: la proposta non compare né fra i nodi del grafo né nella scheda del criterio della Fase 5, quindi testo integrale e prove non sono disponibili.</p>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
              {p.criterio && <Chip>criterio {p.criterio}</Chip>}
              {p.punteggio && <Chip>{p.punteggio} punti</Chip>}
              {p.agente && <Chip mono>{p.agente}</Chip>}
            </div>
          </Card>
        )}
        {g && (
          <Card tono="crit">
            <TitoloSezione azioni={<Button size="sm" variant="ghost" asChild><Link to="../grafo?filtro=gap"><GraphIcon aria-hidden="true" />Vedi nel Grafo</Link></Button>}>
              Gap di origine e prove <span className="ml-1 font-mono text-micro text-status-crit">{g.id}</span>
            </TitoloSezione>
            {g.sintesi && <p className="mb-3 text-sm text-foreground-2">{g.sintesi}</p>}
            <Prove prove={g.prove} vuoto="Nessuna prova collegata nel registro dei gap." />
          </Card>
        )}
      </Split>
    </>
  )
}
