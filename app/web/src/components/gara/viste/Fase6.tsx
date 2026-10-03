import { useState } from "react"
import { Link, useParams } from "react-router"
import { CheckIcon, GraphIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { BottoneScelta, Card, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { PannelloFase } from "../PannelloFase"
import { TestataVista } from "../TestataVista"
import { useGara } from "../GaraContext"
import { useEsegui } from "../AzioniFase"
import { ETICHETTA_SEV, Prove, TONO_SEV } from "./Fase5"
import { useDettaglioProposta, useGap, useProposte } from "@/hooks/useGaraDati"
import { quandoBreve } from "@/lib/formato"
import { paragrafi, type Decisione } from "@/lib/md"
import { risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import type { Proposta } from "@/dominio/registri"
import type { Tono } from "@/dominio/fasi"
import { corpoFase, STATO, statoFase } from "@/dominio/fasi"

const DEC: Record<Decisione, { tono: Tono; etichetta: string }> = {
  approvata: { tono: "ok", etichetta: "Approvata" },
  da_modificare: { tono: "attn", etichetta: "Da modificare" },
  scartata: { tono: "crit", etichetta: "Scartata" },
}

function RigaProposta({ p, d }: { p: Proposta; d: Decisione | null }) {
  const { decidi } = useGara()
  const tonoSev = p.severita ? TONO_SEV[p.severita] : null
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
        <BottoneScelta tono="ok" attivo={d === "approvata"} onClick={() => decidi(p.id, "approvata")}><CheckIcon aria-hidden="true" />Approva</BottoneScelta>
        <BottoneScelta tono="attn" attivo={d === "da_modificare"} onClick={() => decidi(p.id, "da_modificare")}>Da modificare</BottoneScelta>
        <BottoneScelta tono="crit" attivo={d === "scartata"} onClick={() => decidi(p.id, "scartata")}>Scarta</BottoneScelta>
        <Button size="sm" variant="ghost" asChild><Link to={`proposta/${encodeURIComponent(p.id)}`}>Dettaglio</Link></Button>
      </div>
    </article>
  )
}

export function Fase6Elenco() {
  const { slug, decisioni } = useGara()
  const q = useProposte(slug)
  const r = risorsa(q, { vuoto: (d) => !d || d.length === 0, percorso: "06_registers/proposal_register.md" })
  const { approva, inCorso } = useEsegui()
  const [tutte, setTutte] = useState(false)
  const righe = q.data || []
  const decisioneDi = (p: Proposta) => decisioni[p.id] || p.decisione || null
  const decise = righe.filter((p) => decisioneDi(p)).length
  const tutteDecise = righe.length > 0 && decise === righe.length
  const pct = righe.length ? Math.round((decise / righe.length) * 100) : 0
  const mostrate = tutte ? righe : righe.slice(0, 4)

  return (
    <Split aside={<PannelloFase n={6} />}>
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
            <Button disabled={!tutteDecise || inCorso} title={tutteDecise ? "" : "Ogni proposta deve avere una decisione prima di procedere"} onClick={() => approva(6)}>Conferma revisione e avvia Fase 7</Button>
          </div>
          <p className="mb-3 text-micro text-muted-foreground">Le azioni per riga servono ai casi ovvi; per leggere il contenuto completo, i gap di origine e lo storico delle note, apri il dettaglio.</p>
          <div className="space-y-2">{mostrate.map((p) => <RigaProposta key={p.id} p={p} d={decisioneDi(p)} />)}</div>
          {righe.length > 4 && <Button size="sm" variant="outline" className="mt-3" onClick={() => setTutte((v) => !v)}>{tutte ? "Mostra solo le prime 4" : righe.length - 4 === 1 ? "Mostra l'altra proposta" : `Mostra le altre ${righe.length - 4} proposte`}</Button>}
        </Card>
      )}
    </Split>
  )
}

export function Fase6Dettaglio() {
  const { slug, gara, decisioni, storicoDecisioni, decidi } = useGara()
  const { id = "" } = useParams()
  const proposte = useProposte(slug)
  const gap = useGap(slug)
  const nodo = useDettaglioProposta(slug, id)
  const [nota, setNota] = useState("")
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
  const d = decisioni[p.id] || p.decisione || null
  const g = (gap.data || []).find((x) => x.id === p!.riferimento || x.proposta === p!.id)
  const corpo6 = corpoFase(gara.fasi, 6) || {}
  const voci = [
    ...(corpo6.conclusa_il ? [{ cosa: "Proposta generata", chi: "pipeline, Fase 6", quando: quandoBreve(String(corpo6.conclusa_il)), tono: "run" as Tono, nota: null as string | null }] : []),
    ...storicoDecisioni.filter((x) => x.riferimento === p!.id).map((x) => ({ cosa: DEC[x.decisione].etichetta, chi: "operatore", quando: quandoBreve(x.quando), tono: DEC[x.decisione].tono, nota: x.nota })),
  ]
  const fm = (nodo.data?.frontmatter || {}) as Record<string, unknown> & { evidence_documents?: { doc?: string; sezione?: string; estratto?: string }[] }

  return (
    <>
      {testata}
      <Split larga aside={
        <>
          <Card tono="attn">
            <h3 className="mb-2 text-sm font-semibold">Decisione</h3>
            <div className="mb-3 grid gap-1.5">
              <BottoneScelta tono="ok" attivo={d === "approvata"} className="h-8 justify-start" onClick={() => decidi(p!.id, "approvata", nota || null)}><CheckIcon aria-hidden="true" />Approva così com'è</BottoneScelta>
              <BottoneScelta tono="attn" attivo={d === "da_modificare"} className="h-8 justify-start" onClick={() => decidi(p!.id, "da_modificare", nota || null)}>Rimanda con richiesta di modifica</BottoneScelta>
              <BottoneScelta tono="crit" attivo={d === "scartata"} className="h-8 justify-start" onClick={() => decidi(p!.id, "scartata", nota || null)}>Scarta la proposta</BottoneScelta>
            </div>
            <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota per la decisione" placeholder={d === "da_modificare" ? "Cosa deve cambiare? Obbligatorio per il rimando" : "Nota per lo storico, facoltativa"} />
            <p className="mt-1.5 text-micro text-muted-foreground">La nota viene passata all'agente in caso di rimando ed entra nello storico in ogni caso.</p>
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
            <div className="space-y-2 text-sm leading-[1.6] text-foreground-2">{paragrafi(nodo.data.corpo, 8).map((par, i) => <p key={i}>{par}</p>)}</div>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
              {typeof fm.criterio === "string" && fm.criterio && <Chip>criterio {fm.criterio}</Chip>}
              {typeof fm.sottocriterio === "string" && fm.sottocriterio && <Chip>{fm.sottocriterio}</Chip>}
              {fm.punteggio_stimato !== undefined && <Chip>{String(fm.punteggio_stimato)} punti stimati</Chip>}
              {typeof fm.confidence === "string" && fm.confidence && <Chip mono>confidence: {fm.confidence}</Chip>}
              {typeof fm.stato === "string" && fm.stato && <BadgeStato tono="ok">{fm.stato}</BadgeStato>}
            </div>
            {(fm.evidence_documents || []).length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold">Prove documentali del nodo</h4>
                <Prove prove={(fm.evidence_documents || []).map((e) => ({ fonte: `${e.doc || "documento"}${e.sezione ? `, ${e.sezione}` : ""}`, testo: e.estratto || "", contraria: false }))} vuoto="" />
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <TitoloSezione>Contenuto della proposta</TitoloSezione>
            <p className="text-sm text-foreground-2">{p.sintesi || "Il registro riporta questa proposta senza un contenuto esteso."}</p>
            <p className="mt-2 text-micro text-muted-foreground">Questa è la sintesi del registro. Il testo integrale e le prove collegate compaiono quando la proposta diventa un nodo del grafo, cioè dopo l'elaborazione del feedback.</p>
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
