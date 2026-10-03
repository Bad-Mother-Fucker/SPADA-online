// Fase 4, domande al professionista: il registro unico delle domande che le
// Fasi 1, 2 e 3 e le integrazioni hanno posto, le indicazioni strategiche e
// le informazioni che il professionista aggiunge di sua iniziativa. La bozza
// vive qui finché non si salva; salvare scrive il registro senza inviare;
// inviare = salvare e poi eseguire la Fase 4.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CaretRightIcon, PaperPlaneRightIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, Nota, Scheletro, Split } from "@/components/comuni/Primitivi"
import { Inline } from "@/components/comuni/Markdown"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { DialogoConferma, type Conferma } from "../DialogoConferma"
import { PannelloFase } from "../PannelloFase"
import { useGara } from "../GaraContext"
import { useEsegui } from "../AzioniFase"
import { AzioniEsporta } from "./Documento"
import { useAggiungiInformazione, useDomande, useEliminaInformazione, useSalvaDomande, type Domanda, type IndicazioniDomande, type RegistroDomande } from "@/hooks/useGaraDati"
import { quandoBreve } from "@/lib/formato"
import { testoSemplice } from "@/lib/md"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import type { Tono } from "@/dominio/fasi"
import { motivoBlocco, statoFase } from "@/dominio/fasi"

const GRUPPI = [
  { id: "quesito_sa", titolo: "Quesiti alla stazione appaltante", aiuto: "Da inviare entro il termine dei chiarimenti: rispondi se inviarli e come." },
  { id: "amministrativa", titolo: "Adempimenti e requisiti", aiuto: "Sopralluogo, requisiti dell'impresa per i criteri tabellari e premiali, forma di partecipazione." },
  { id: "tecnica", titolo: "Domande tecniche dagli elaborati", aiuto: "Nascono dalla lettura degli elaborati: discordanze, valori di progetto, documenti mancanti." },
  { id: "strategica", titolo: "Domande strategiche", aiuto: "Dai dati dell'audit strategico: margine, prezzi, cantiere, priorità." },
  { id: "informazione", titolo: "Informazioni aggiunte da te", aiuto: "Quello che vuoi far sapere alla pipeline anche se nessuno l'ha chiesto." },
]
const TONI = [
  { id: "conservativo", hint: "Proposte prudenti, ancorate a prove solide e a costi contenuti." },
  { id: "bilanciato", hint: "Equilibrio fra punteggio atteso e costo o rischio delle migliorie." },
  { id: "audace", hint: "Proposte ambiziose dove il punteggio lo giustifica, accettando più rischio." },
]

type Bozza = { risposte: Record<string, string>; indicazioni: IndicazioniDomande }
const bozzaDa = (d: RegistroDomande): Bozza => ({ risposte: Object.fromEntries(d.domande.map((x) => [x.id, x.risposta || ""])), indicazioni: structuredClone(d.indicazioni) })

/** Stato di una voce rispetto all'invio: dice al professionista cosa partirà con il prossimo invio. */
function statoInvio(x: Domanda, bozza: string | undefined): { tono: Tono; testo: string } {
  const r = (bozza ?? x.risposta ?? "").trim()
  if (!r) return { tono: "neu", testo: "senza risposta" }
  if ((bozza ?? x.risposta) !== x.risposta) return { tono: "attn", testo: "modificata, da salvare" }
  if (!x.inviata_il) return { tono: "attn", testo: "da inviare" }
  if ((x.risposta_il || "") > x.inviata_il) return { tono: "attn", testo: "cambiata dopo l'invio" }
  return { tono: "ok", testo: `inviata ${quandoBreve(x.inviata_il)}` }
}

/** Stessa regola del backend: tono e una priorità, livello o indicazione, per ogni criterio. */
function mancantiDi(b: Bozza) {
  const m: string[] = []
  if (!b.indicazioni.tono) m.push("tono generale")
  for (const p of b.indicazioni.priorita) if (!p.livello && !(p.indicazione || "").trim()) m.push(`priorità di ${p.id}`)
  return m
}

/** Quante voci partirebbero con il prossimo invio, compresa la bozza non salvata. */
function daInviareDi(d: RegistroDomande, b: Bozza) {
  let n = 0
  for (const x of d.domande) {
    if (x.stato === "superata") continue
    const r = (b.risposte[x.id] ?? x.risposta ?? "").trim()
    if (!r) continue
    if (r !== (x.risposta || "").trim() || !x.inviata_il || (x.risposta_il || "") > x.inviata_il) n++
  }
  const ind = d.indicazioni
  const indCambiate = JSON.stringify(b.indicazioni) !== JSON.stringify(ind) || !!(ind.aggiornate_il && (!ind.inviate_il || ind.aggiornate_il > ind.inviate_il))
  return n + (indCambiate ? 1 : 0)
}

export function Fase4() {
  const { slug, gara } = useGara()
  const q = useDomande(slug)
  const salva = useSalvaDomande(slug)
  const aggiungi = useAggiungiInformazione(slug)
  const elimina = useEliminaInformazione(slug)
  const { esegui, riesegui, inCorso } = useEsegui()
  const r = risorsa(q, { percorso: `/gare/${slug}/domande` })
  const [bozza, setBozza] = useState<Bozza | null>(null)
  const [modificata, setModificata] = useState(false)
  const [nuova, setNuova] = useState({ titolo: "", testo: "", criterio: "" })
  const [conRisposte, setConRisposte] = useState(true)
  const [superateAperte, setSuperateAperte] = useState(false)
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const d = q.data

  // La bozza nasce dal registro e lo segue finché non la si tocca; se il
  // registro cambia mentre si scrive (una fase ha aggiunto domande), le
  // domande nuove entrano nella bozza senza toccare il resto.
  useEffect(() => {
    if (!d) return
    setBozza((b) => {
      if (!b || !modificata) return bozzaDa(d)
      const risposte = { ...b.risposte }
      for (const x of d.domande) if (!(x.id in risposte)) risposte[x.id] = x.risposta || ""
      return { ...b, risposte }
    })
  }, [d, modificata])

  const st4 = statoFase(gara.fasi, 4)
  const inEsecuzione = st4 === "in_esecuzione"
  const blocco = motivoBlocco(gara.fasi, 4)
  const mancanti = useMemo(() => (bozza ? mancantiDi(bozza) : []), [bozza])
  const daInviare = useMemo(() => (d && bozza ? daInviareDi(d, bozza) : 0), [d, bozza])
  const nomeGara = gara.manifest.nome || slug

  if (!d || !bozza) {
    return (
      <Split aside={<PannelloFase n={4} />}>
        {r.stato === "errore" && r.errore ? <StatoErrore titolo="Registro delle domande non disponibile" errore={r.errore} percorso={`/gare/${slug}/domande`} onRiprova={r.riprova} /> : <Scheletro righe={8} />}
      </Split>
    )
  }

  const attive = d.domande.filter((x) => x.stato !== "superata")
  const superate = d.domande.filter((x) => x.stato === "superata")
  const gruppi = GRUPPI.map((g) => ({ ...g, voci: attive.filter((x) => x.categoria === g.id) }))
  const conRispostaN = attive.filter((x) => ((bozza.risposte[x.id] ?? x.risposta) || "").trim()).length
  const ultimoInvio = d.invii.slice(-1)[0]
  const etichette = Object.fromEntries(d.criteri.map((c) => [c.id, c.etichetta]))

  const aggiornaRisposta = (id: string, v: string) => { setBozza((b) => b && { ...b, risposte: { ...b.risposte, [id]: v } }); setModificata(true) }
  const aggiornaInd = (fn: (x: IndicazioniDomande) => void) => { setBozza((b) => { if (!b) return b; const n = structuredClone(b); fn(n.indicazioni); return n }); setModificata(true) }

  const salvaBozza = async (silenzioso = false): Promise<boolean> => {
    if (!bozza) return false
    const cambiate = Object.fromEntries(Object.entries(bozza.risposte).filter(([id, r]) => (d.domande.find((x) => x.id === id)?.risposta || "") !== r))
    const ind = bozza.indicazioni
    try {
      await salva.mutateAsync({ risposte: cambiate, indicazioni: { tono: ind.tono, priorita: ind.priorita, note: ind.note || "", vincoli: (ind.vincoli || []).filter((x) => x.trim()), opportunita: (ind.opportunita || []).filter((x) => x.trim()) } })
      setModificata(false)
      if (!silenzioso) toast.success("Bozza salvata", { description: "Le risposte entrano nel contesto quando invii la Fase 4." })
      return true
    } catch (e) {
      toast.error("Salvataggio non riuscito", { description: comeApiError(e).message })
      return false
    }
  }

  /** Invio = salvataggio + esecuzione della Fase 4; riesecuzione se già eseguita. */
  const invia = async () => {
    if (modificata && !(await salvaBozza(true))) return
    if (st4 === "in_coda") esegui(4)
    else setConferma({
      titolo: "Inviare di nuovo risposte e indicazioni?",
      descrizione: "Memoria, grafo e brief si aggiornano, e le fasi successive già completate diventano da rivedere.",
      etichetta: "Invia di nuovo",
      onConferma: () => riesegui(4),
    })
  }

  const aggiungiInformazione = async () => {
    if (!nuova.titolo.trim() || !nuova.testo.trim()) { toast.error("Scrivi argomento e contenuto dell'informazione."); return }
    if (modificata && !(await salvaBozza(true))) return
    aggiungi.mutate({ titolo: nuova.titolo.trim(), testo: nuova.testo.trim(), criterio: nuova.criterio || null }, {
      onSuccess: () => { setModificata(false); setNuova({ titolo: "", testo: "", criterio: "" }); toast.success("Informazione aggiunta", { description: "Parte con il prossimo invio della Fase 4." }) },
      onError: (e) => toast.error("Informazione non aggiunta", { description: comeApiError(e).message }),
    })
  }
  const eliminaInformazione = (x: Domanda) => setConferma({
    titolo: `Eliminare l'informazione ${x.id}?`, descrizione: "Non è ancora stata inviata.", etichetta: "Elimina", distruttiva: true,
    onConferma: async () => {
      if (modificata && !(await salvaBozza(true))) return
      elimina.mutate(x.id, { onSuccess: () => setModificata(false), onError: (e) => toast.error("Eliminazione non riuscita", { description: comeApiError(e).message }) })
    },
  })

  const motivoInvio = blocco || (mancanti.length ? `Mancano: ${mancanti.join(", ")}` : "")
  const statoTesto = salva.isPending ? "Salvataggio in corso" : inEsecuzione ? "Invio in corso: le risposte si stanno integrando nel contesto."
    : modificata ? "Modifiche non ancora salvate." : mancanti.length ? `Bozza salvata. Per inviare manca: ${mancanti.slice(0, 4).join(", ")}${mancanti.length > 4 ? "…" : ""}.`
    : blocco ? `Bozza salvata. ${blocco}` : daInviare ? "Bozza salvata, pronta da inviare." : "Tutto inviato."
  const tonoStato = mancanti.length || blocco ? "text-status-attn" : modificata || daInviare ? "text-status-run" : "text-status-ok"

  const testoEsporta = () => {
    const righe = [`Domande al professionista, ${nomeGara}`, new Date().toLocaleDateString("it-IT"), ""]
    for (const g of gruppi) {
      if (!g.voci.length) continue
      righe.push(g.titolo.toUpperCase(), "")
      g.voci.forEach((x, k) => {
        righe.push(`${k + 1}. [${x.id}] ${testoSemplice(x.testo)}${x.criterio ? ` (${x.criterio})` : ""}`)
        if (conRisposte) { const ris = (bozza.risposte[x.id] ?? x.risposta ?? "").trim(); const linee = ris ? ris.split("\n") : ["(non ancora data)"]; righe.push(`   Risposta: ${linee[0]}`, ...linee.slice(1).map((l) => `             ${l}`)) }
        righe.push("")
      })
    }
    return righe.join("\n").trimEnd() + "\n"
  }

  const voce = (x: Domanda) => {
    const si = statoInvio(x, bozza.risposte[x.id])
    const proprio = x.origine === "professionista"
    return (
      <div key={x.id} id={`dom-${x.id}`} className="space-y-1.5 border-t pt-3 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Label htmlFor={`dom-r-${x.id}`} className="flex items-start gap-2 text-sm font-normal"><Chip mono>{x.id}</Chip><span><Inline testo={x.testo} /></span></Label>
          <div className="flex shrink-0 items-center gap-1.5">{x.criterio && <Chip mono>{x.criterio}</Chip>}<BadgeStato tono={si.tono}>{si.testo}</BadgeStato></div>
        </div>
        <p className="text-micro text-muted-foreground">
          {x.perche && <Inline testo={x.perche.replace(/[.]\s*$/, "")} />}{x.perche && x.fonte && " · "}{x.fonte && <span className="font-mono">{x.fonte}</span>}{(x.perche || x.fonte) && " · "}{d.etichette.origini[x.origine] || x.origine}
        </p>
        <Textarea id={`dom-r-${x.id}`} rows={proprio ? 4 : 3} disabled={inEsecuzione} placeholder={proprio ? "Il contenuto dell'informazione" : "La tua risposta"} value={bozza.risposte[x.id] ?? x.risposta ?? ""} onChange={(e) => aggiornaRisposta(x.id, e.target.value)} />
        {proprio && !x.inviata_il && <Button size="sm" variant="ghost" disabled={inEsecuzione} onClick={() => eliminaInformazione(x)}><TrashIcon aria-hidden="true" />Elimina</Button>}
      </div>
    )
  }

  return (
    <Split aside={<PannelloFase n={4} azionePrimaria={{ etichetta: inEsecuzione ? "Invio in corso" : "Salva e invia", onClick: () => void invia(), disabilitata: salva.isPending || inEsecuzione || inCorso || !!motivoInvio, titolo: motivoInvio }} />}>
      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Domande e indicazioni</h3>
            <p className="text-xs text-foreground-2">{ultimoInvio ? `Ultimo invio ${quandoBreve(ultimoInvio.inviato_il)}. Le risposte nuove o cambiate da allora partono con il prossimo invio.` : "Nessun invio ancora: le risposte che salvi restano una bozza finché non esegui la fase. Puoi rispondere un po' alla volta, anche in sessioni diverse."}</p>
          </div>
          <div className="flex shrink-0 gap-1.5"><Chip>{conRispostaN}/{attive.length} con risposta</Chip><BadgeStato tono={daInviare ? "attn" : "ok"}>{daInviare ? `${daInviare} da inviare` : "nulla da inviare"}</BadgeStato></div>
        </div>
        <AzioniEsporta testo={testoEsporta} nomeFile={() => `domande-${slug}${conRisposte ? "-con-risposte" : ""}.txt`} conRisposte={conRisposte} onConRisposte={setConRisposte} quante={attive.length} />
        {!attive.length && <p className="mt-3 text-xs text-muted-foreground">Il registro è vuoto: le domande le aggiungono le Fasi 1, 2 e 3. Puoi comunque dare le indicazioni strategiche e aggiungere informazioni.</p>}
      </Card>

      {gruppi.map((g) => (g.voci.length || g.id === "informazione") && (
        <Card key={g.id} className="space-y-3">
          <div className="flex items-start justify-between gap-3"><h3 className="text-md font-semibold">{g.titolo}</h3><Chip>{g.voci.filter((x) => ((bozza.risposte[x.id] ?? x.risposta) || "").trim()).length}/{g.voci.length}</Chip></div>
          <p className="text-xs text-foreground-2">{g.aiuto}</p>
          {g.voci.map(voce)}
          {g.id === "informazione" && (
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-semibold">Aggiungi un'informazione</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1"><Label htmlFor="info-titolo">Argomento</Label><Input id="info-titolo" value={nuova.titolo} placeholder="Es. budget per le migliorie" onChange={(e) => setNuova({ ...nuova, titolo: e.target.value })} /></div>
                <div className="grid gap-1"><Label htmlFor="info-criterio">Criterio, facoltativo</Label>
                  <Select value={nuova.criterio || "__"} onValueChange={(v) => setNuova({ ...nuova, criterio: v === "__" ? "" : v })}>
                    <SelectTrigger id="info-criterio" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="__">nessuno in particolare</SelectItem>{d.criteri.map((c) => <SelectItem key={c.id} value={c.id}>{c.etichetta}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1"><Label htmlFor="info-testo">Contenuto</Label><Textarea id="info-testo" rows={3} value={nuova.testo} placeholder="Es. l'impresa può investire fino a 25.000 euro in migliorie, con priorità al fotovoltaico." onChange={(e) => setNuova({ ...nuova, testo: e.target.value })} /></div>
              <Button size="sm" variant="outline" disabled={inEsecuzione || aggiungi.isPending} onClick={() => void aggiungiInformazione()}><PlusIcon aria-hidden="true" />Aggiungi</Button>
            </div>
          )}
        </Card>
      ))}

      <Card id="sez-indicazioni-strategiche" className="space-y-5 scroll-mt-16">
        <div className="flex items-start justify-between gap-3"><h3 className="text-md font-semibold">Indicazioni strategiche</h3><BadgeStato tono={mancanti.length ? "attn" : "ok"}>{mancanti.length ? `${mancanti.length} da compilare` : "complete"}</BadgeStato></div>
        <p className="text-xs text-foreground-2">Guidano la ricerca soluzioni in Fase 5, come cornice delle proposte, e la stesura dell'offerta in Fase 7, priorità e budget di facciate. Tono e una priorità per criterio servono per inviare.</p>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Tono generale</h4>
          <div role="radiogroup" aria-label="Tono generale" className="inline-flex overflow-hidden rounded-lg border border-input">
            {TONI.map((t) => <button key={t.id} type="button" role="radio" aria-checked={bozza.indicazioni.tono === t.id} disabled={inEsecuzione} onClick={() => aggiornaInd((x) => { x.tono = t.id })} className={cn("px-3 py-1 text-xs transition-colors duration-(--d-fast)", bozza.indicazioni.tono === t.id ? "bg-foreground text-background" : "text-foreground-2 hover:bg-muted")}>{t.id}</button>)}
          </div>
          <p className="mt-1.5 text-micro text-muted-foreground">{TONI.find((t) => t.id === bozza.indicazioni.tono)?.hint || "Scegli il tono con cui la pipeline costruirà le proposte."}</p>
        </div>
        <div>
          <h4 className="mb-1 text-sm font-semibold">Priorità per criterio</h4>
          <p className="mb-2 text-micro text-muted-foreground">ALTA dà una facciata in più al criterio nella relazione tecnica. Basta il livello o l'indicazione.</p>
          {bozza.indicazioni.priorita.length ? (
            <div className="space-y-2">
              {bozza.indicazioni.priorita.map((p, k) => (
                <div key={p.id} className="grid grid-cols-[1fr_120px_1fr] items-center gap-2">
                  <Label htmlFor={`ind-crit-${p.id}`} className="text-xs font-normal text-foreground-2"><Inline testo={etichette[p.id] || p.id} /></Label>
                  <Select value={p.livello || "__"} onValueChange={(v) => aggiornaInd((x) => { x.priorita[k].livello = v === "__" ? "" : v })} disabled={inEsecuzione}>
                    <SelectTrigger aria-label={`Priorità di ${p.id}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["__", "ALTA", "MEDIA", "BASSA"].map((l) => <SelectItem key={l} value={l}>{l === "__" ? "priorità" : l}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input id={`ind-crit-${p.id}`} value={p.indicazione || ""} disabled={inEsecuzione} placeholder="Indicazione per questo criterio" className="h-8 text-xs" onChange={(e) => aggiornaInd((x) => { x.priorita[k].indicazione = e.target.value })} />
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">I criteri compaiono dopo la Fase 1.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1"><Label htmlFor="ind-vincoli">Vincoli specifici</Label><Textarea id="ind-vincoli" rows={3} disabled={inEsecuzione} placeholder="Uno per riga, es. nessun intervento visibile sulla cupola" value={(bozza.indicazioni.vincoli || []).join("\n")} onChange={(e) => aggiornaInd((x) => { x.vincoli = e.target.value.split("\n") })} /><span className="text-micro text-muted-foreground">Facoltativo. Uno per riga.</span></div>
          <div className="grid gap-1"><Label htmlFor="ind-opportunita">Opportunità da valorizzare</Label><Textarea id="ind-opportunita" rows={3} disabled={inEsecuzione} placeholder="Una per riga" value={(bozza.indicazioni.opportunita || []).join("\n")} onChange={(e) => aggiornaInd((x) => { x.opportunita = e.target.value.split("\n") })} /><span className="text-micro text-muted-foreground">Facoltativo. Una per riga.</span></div>
        </div>
        <div className="grid gap-1"><Label htmlFor="ind-note">Note aggiuntive</Label><Textarea id="ind-note" rows={3} disabled={inEsecuzione} placeholder="Testo libero" value={bozza.indicazioni.note || ""} onChange={(e) => aggiornaInd((x) => { x.note = e.target.value })} /></div>
      </Card>

      {superate.length > 0 && (
        <Card className="p-0">
          <button type="button" aria-expanded={superateAperte} onClick={() => setSuperateAperte((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs text-foreground-2 hover:text-foreground">
            <CaretRightIcon size={12} className={cn("transition-transform duration-(--d-base)", superateAperte && "rotate-90")} aria-hidden="true" />Domande superate ({superate.length}), risolte dalle fasi successive o sostituite
          </button>
          {superateAperte && (
            <div className="space-y-3 border-t px-4 py-3">
              {superate.map((x) => (
                <div key={x.id} className="text-xs">
                  <div className="flex items-start gap-2"><Chip mono>{x.id}</Chip><span><Inline testo={x.testo} /></span></div>
                  <p className="mt-1 text-micro text-muted-foreground">Superata: {x.motivo_superata || "senza motivo"}{x.superata_da ? ` (vedi ${x.superata_da})` : ""}</p>
                  {(x.risposta || "").trim() && <p className="text-micro text-muted-foreground">Risposta data: {x.risposta}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <span className={cn("text-xs", tonoStato)} aria-live="polite">{statoTesto}</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={salva.isPending || !modificata || inEsecuzione} onClick={() => void salvaBozza()}>Salva bozza</Button>
          <Button disabled={salva.isPending || inEsecuzione || inCorso || !!motivoInvio} title={motivoInvio} onClick={() => void invia()}><PaperPlaneRightIcon aria-hidden="true" />Salva e invia</Button>
        </div>
      </div>
      {blocco && <Nota tono="neu">{blocco} Nel frattempo puoi rispondere e salvare la bozza.</Nota>}
      <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />
    </Split>
  )
}
