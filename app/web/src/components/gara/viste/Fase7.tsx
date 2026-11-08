import { useState } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"
import { ArrowCounterClockwiseIcon, CheckIcon, DownloadSimpleIcon, FileArrowDownIcon, FilePdfIcon, FileDocIcon, FileXlsIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, Kv, Nota, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { Blocchi } from "@/components/comuni/Markdown"
import { ControlloInterruzione } from "../ControlloInterruzione"
import { Avanzamento } from "../Avanzamento"
import { motivoBlocco } from "@/dominio/fasi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { DialogoConferma, type Conferma } from "../DialogoConferma"
import { PannelloFase } from "../PannelloFase"
import { TestataVista } from "../TestataVista"
import { PannelloGrafiche } from "./Grafiche"
import { PannelloSchede } from "./Schede"
import { useGara } from "../GaraContext"
import { fileDeliverable, useDeliverableAzioni, useDeliverables, useTestoOutput, type Deliverable, type StadioDeliverable } from "@/hooks/useGaraDati"
import { Api } from "@/lib/api"
import { blocchi } from "@/lib/md"
import { plurale, quandoBreve } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import type { Tono } from "@/dominio/fasi"

const STATO_DEL: Record<string, { tono: Tono; etichetta: string }> = {
  individuato: { tono: "neu", etichetta: "Individuato" },
  da_eseguire: { tono: "neu", etichetta: "Da avviare" },
  in_coda: { tono: "run", etichetta: "In coda" },
  in_esecuzione: { tono: "run", etichetta: "In lavorazione" },
  da_approvare: { tono: "attn", etichetta: "Da approvare" },
  interrotta: { tono: "attn", etichetta: "Interrotto" },
  completata: { tono: "ok", etichetta: "Prodotto" },
  da_rivedere: { tono: "attn", etichetta: "Da aggiornare" },
  errore: { tono: "crit", etichetta: "Errore" },
}
const STATO_STADIO: Record<StadioDeliverable["stato"], { tono: Tono; etichetta: string }> = {
  da_produrre: { tono: "neu", etichetta: "Da produrre" },
  da_approvare: { tono: "attn", etichetta: "Da approvare" },
  approvato: { tono: "ok", etichetta: "Approvato" },
  superato: { tono: "attn", etichetta: "Da rifare" },
}
const statoDel = (d: Deliverable, chiusa: boolean) => {
  if ((!d.stato || d.stato === "da_eseguire") && chiusa) return STATO_DEL.individuato
  return STATO_DEL[d.stato || ""] || STATO_DEL.da_eseguire
}
const aStadi = (d: Deliverable) => d.stadi.length > 1
const lavora = (d: Deliverable) => !!d.job || d.stato === "in_esecuzione" || d.stato === "in_coda"
/** Stadio che il job sta producendo: quello indicato dalla coda, o il primo da produrre. */
const stadioInLavorazione = (d: Deliverable) =>
  !lavora(d) ? null : d.job?.stadio || d.stadi.find((s) => s.stato === "da_produrre" || s.stato === "superato")?.id || d.stadi[0]?.id || null
const etichettaStadio = (d: Deliverable, id?: string | null) => d.stadi.find((s) => s.id === id)?.etichetta.toLowerCase() || "il documento"
const prossimoDaProdurre = (d: Deliverable) => d.stadi.find((s) => s.stato === "da_produrre" || s.stato === "superato") || null
const inAttesa = (d: Deliverable) => d.stadi.find((s) => s.stato === "da_approvare") || null

function useAzioni() {
  const { slug } = useGara()
  const az = useDeliverableAzioni(slug)
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const esito = (ok: string, ko: string) => ({ onSuccess: () => toast.success(ok), onError: (e: unknown) => toast.error(ko, { description: comeApiError(e).message }) })
  return {
    az,
    avvia: (d: Deliverable) => az.esegui.mutate(d.id, esito(`${d.nome}: ${etichettaStadio(d, prossimoDaProdurre(d)?.id)} accodato.`, "Avvio non riuscito")),
    daCapo: (d: Deliverable) => setConferma({
      titolo: `Rifare da capo «${d.nome}»?`, descrizione: aStadi(d) ? "Si riparte dal primo stadio, con le decisioni e i dati attuali. Il lavoro già fatto, comprese le tue modifiche, viene archiviato, non cancellato." : "Il documento viene rigenerato con le decisioni e i dati attuali; quello attuale viene archiviato.", etichetta: "Rifai da capo",
      onConferma: () => az.riesegui.mutate(d.id, esito(`${d.nome}: riesecuzione accodata.`, "Riesecuzione non riuscita")),
    }),
    /** Rifà un solo stadio: quelli prima restano come approvati, quelli dopo restano ma vanno rivisti. */
    rifaiStadio: (d: Deliverable, s: StadioDeliverable) => {
      const i = d.stadi.findIndex((x) => x.id === s.id)
      const prima = d.stadi.slice(0, i)
      const dopo = d.stadi.slice(i + 1).filter((x) => x.stato !== "da_produrre")
      const elenco = (xs: StadioDeliverable[]) => xs.map((x) => `«${x.etichetta}»`).join(" e ")
      setConferma({
        titolo: `Rifare solo «${s.etichetta}»?`, etichetta: `Rifai ${s.etichetta.toLowerCase()}`,
        descrizione: `L'agente lo riscrive da zero con le decisioni e i dati attuali${prima.length ? `, seguendo ${elenco(prima)} come approvat${prima.length > 1 ? "i" : "a"}` : ""}. La versione attuale${s.prodotto_il && s.stato !== "da_produrre" ? ", con le tue eventuali modifiche," : ""} viene archiviata, non cancellata.${dopo.length ? ` ${elenco(dopo)} ${dopo.length === 1 ? "resta com'è, segnato da rifare" : "restano come sono, segnati da rifare"}: ${dopo.length === 1 ? "lo rigeneri" : "li rigeneri"} quando vuoi.` : ""}`,
        onConferma: () => az.rifai.mutate({ id: d.id, stadio: s.id }, esito(`${s.etichetta}: nuova versione accodata.`, "Riesecuzione non riuscita")),
      })
    },
    dialogo: <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />,
    occupato: az.esegui.isPending || az.riesegui.isPending || az.approva.isPending || az.modifica.isPending || az.salva.isPending || az.rifai.isPending,
  }
}

/** L'azione principale sulla card: dipende da dove si trova il documento. */
function AzioneCard({ d, blocco, avvia, daCapo }: { d: Deliverable; blocco: string | null; avvia: () => void; daCapo: () => void }) {
  if (d.job) return <ControlloInterruzione job={d.job} compatto />
  const attesa = inAttesa(d)
  if (attesa) return <Button size="sm" asChild><Link to={`deliverable/${encodeURIComponent(d.id)}`}>Rivedi {attesa.etichetta.toLowerCase()}</Link></Button>
  if (d.stato === "da_rivedere") return aStadi(d)
    ? <Button size="sm" asChild><Link to={`deliverable/${encodeURIComponent(d.id)}`} title="Scritto prima della conferma delle decisioni: scegli se rifare uno stadio o tutto">Rifai…</Link></Button>
    : <Button size="sm" disabled={!!blocco} title={blocco || "Scritto prima della conferma delle decisioni: va rifatto"} onClick={daCapo}>Rifai</Button>
  if (d.stato === "completata") return null
  const prossimo = prossimoDaProdurre(d)
  const etichetta = d.stato === "interrotta" ? "Riprendi" : d.stato === "errore" ? "Riprova" : aStadi(d) && prossimo ? `Produci ${prossimo.etichetta.toLowerCase()}` : "Avvia"
  return <Button size="sm" disabled={!!blocco} title={blocco || undefined} onClick={avvia}>{etichetta}</Button>
}

function CardDeliverable({ d, blocco, avvia, daCapo }: { d: Deliverable; blocco: string | null; avvia: () => void; daCapo: () => void }) {
  const { output } = useGara()
  const st = statoDel(d, !!blocco)
  const file = fileDeliverable(output, d)
  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <BadgeStato tono={st.tono} pulsa={d.stato === "in_esecuzione"}>{st.etichetta}</BadgeStato>
        <span className="truncate text-micro text-muted-foreground">{d.trasversale ? "tutti i criteri" : d.criteri.join(", ")}</span>
      </div>
      <Link to={`deliverable/${encodeURIComponent(d.id)}`} className="rounded-sm">
        <span className="block text-sm font-semibold">{d.nome}</span>
        <span className="block text-xs text-foreground-2">{d.fonte || d.tipo.replace(/_/g, " ")}</span>
      </Link>
      {aStadi(d) ? (
        <ol className="flex flex-wrap gap-1.5" aria-label="Stadi">
          {d.stadi.map((s, i) => {
            const inCorso = stadioInLavorazione(d) === s.id
            const t = inCorso ? { tono: "run" as Tono, etichetta: "In lavorazione" } : STATO_STADIO[s.stato]
            return <li key={s.id}><BadgeStato tono={t.tono} pulsa={inCorso && d.stato === "in_esecuzione"}>{i + 1}. {s.etichetta}{s.stato === "approvato" && !inCorso && <CheckIcon aria-hidden="true" />}</BadgeStato></li>
          })}
        </ol>
      ) : <div className="flex flex-wrap gap-1.5"><Chip mono>{d.agente}</Chip><Chip>{d.tipo.replace(/_/g, " ")}</Chip></div>}
      {d.stato === "in_esecuzione" && <Avanzamento deliverable={d.id} attivo fallback={null} />}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-2.5 text-micro text-muted-foreground">
        <span className="min-w-0 flex-1">{d.skill ? "Procedimento per stadi" : file.length ? plurale(file.length, "file prodotto", "file prodotti") : "Nessun file ancora prodotto"}</span>
        <AzioneCard d={d} blocco={blocco} avvia={avvia} daCapo={daCapo} />
        <Button size="sm" variant="outline" asChild><Link to={`deliverable/${encodeURIComponent(d.id)}`}>Apri</Link></Button>
      </div>
    </article>
  )
}

/** Al posto di «Avvia la fase»: la Fase 7 non si esegue in blocco. */
function RiepilogoDeliverable({ lista, blocco }: { lista: Deliverable[]; blocco: string | null }) {
  if (blocco) return <Nota tono="neu" titolo="Produzione bloccata">{blocco}</Nota>
  const fatti = lista.filter((d) => d.stato === "completata").length
  const attesa = lista.filter((d) => inAttesa(d) && !lavora(d))
  const attivi = lista.filter(lavora)
  return (
    <div className="space-y-3">
      <Kv voci={[["Prodotti", `${fatti} / ${lista.length}`, true], attesa.length ? ["Da approvare", String(attesa.length), true] : null]} />
      {attivi.length ? (
        <ul className="space-y-2" aria-label="Deliverable in corso">
          {attivi.map((d) => (
            <li key={d.id} className="space-y-1.5 rounded-md border p-2">
              <div className="flex items-center gap-2 text-xs">
                <BadgeStato tono="run" pulsa={d.stato === "in_esecuzione"}>{d.stato === "in_esecuzione" ? "In lavorazione" : "In coda"}</BadgeStato>
                <Link to={`deliverable/${encodeURIComponent(d.id)}`} className="min-w-0 flex-1 truncate font-medium">{d.nome}{aStadi(d) ? `, ${etichettaStadio(d, stadioInLavorazione(d))}` : ""}</Link>
              </div>
              {d.stato === "in_esecuzione" && <Avanzamento deliverable={d.id} attivo fallback={null} />}
              {d.job && <ControlloInterruzione job={d.job} compatto className="w-full" />}
            </li>
          ))}
        </ul>
      ) : <p className="text-micro text-muted-foreground">Nessun deliverable in lavorazione.</p>}
      {attesa.length > 0 && (
        <ul className="space-y-1" aria-label="In attesa della tua approvazione">
          {attesa.map((d) => <li key={d.id}><Link className="text-xs text-status-attn underline-offset-2 hover:underline" to={`deliverable/${encodeURIComponent(d.id)}`}>{d.nome}: {inAttesa(d)!.etichetta.toLowerCase()} da approvare</Link></li>)}
        </ul>
      )}
      <p className="text-micro text-muted-foreground">Ogni deliverable si avvia dal suo pulsante. Il worker li esegue uno alla volta, nell'ordine in cui li avvii; ognuno si interrompe per conto suo e riprende da dove si era fermato.</p>
    </div>
  )
}

export function Fase7Elenco() {
  const { slug, gara } = useGara()
  const blocco = motivoBlocco(gara.fasi, 7)
  const q = useDeliverables(slug)
  const r = risorsa(q, { vuoto: (l) => l.length === 0, percorso: `/gare/${slug}/deliverables` })
  const { avvia, daCapo, dialogo } = useAzioni()
  const lista = q.data || []
  return (
    <Split aside={<PannelloFase n={7} azioni={<RiepilogoDeliverable lista={lista} blocco={blocco} />} />}>
      {r.stato === "caricamento" && <Scheletro righe={5} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Elenco dei deliverable non leggibile" errore={r.errore} percorso={`/gare/${slug}/deliverables`} onRiprova={r.riprova} />}
      {r.stato === "assente" && <Card><VuotoInline titolo="Questa vista richiede un backend più recente" testo="Il servizio non espone i deliverable. Riavvia l'app con ./spada riavvia per caricare il backend aggiornato." /></Card>}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Nessun deliverable richiesto" testo="L'elenco è ricavato dal manifesto della gara, che l'analisi del disciplinare compila in Fase 1." /></Card>}
      {r.stato === "ok" && (
        <>
          {blocco && <Nota tono="neu" titolo="Elenco consultabile, produzione non ancora disponibile">Puoi leggere i deliverable e aprirne le schede. {blocco.replace(/^Si sblocca/, "La produzione si sblocca")}</Nota>}
          <Card>
            <p className="text-sm text-foreground-2">Il disciplinare chiede <b className="font-semibold text-foreground">{plurale(lista.length, "documento", "documenti")}</b> per l'offerta tecnica. Ognuno è un documento unico per tutti i criteri e si avvia, si segue e si interrompe per conto suo. Relazione tecnica e computi si producono per stadi: approvi ogni stadio prima che parta il successivo.</p>
          </Card>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
            {lista.map((d) => <CardDeliverable key={d.id} d={d} blocco={blocco} avvia={() => avvia(d)} daCapo={() => daCapo(d)} />)}
          </div>
        </>
      )}
      {dialogo}
    </Split>
  )
}

/** Il testo di uno stadio: lettura, modifica a mano, approvazione, richiesta di modifiche, esportazione. */
function PannelloStadio({ d, s, blocco }: { d: Deliverable; s: StadioDeliverable; blocco: string | null }) {
  const { slug, output } = useGara()
  const { az, avvia, rifaiStadio, dialogo } = useAzioni()
  const testo = useTestoOutput(slug, s.stato === "da_produrre" ? null : s.file, s.prodotto_il)
  const [modo, setModo] = useState<"leggi" | "modifica" | "nota">("leggi")
  const [bozza, setBozza] = useState("")
  const [nota, setNota] = useState("")
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const i = d.stadi.findIndex((x) => x.id === s.id)
  const successivo = d.stadi[i + 1] || null
  const finale = !successivo
  // Computo metrico: accanto al definitivo il sistema scrive il file per PriMus (.xpwe) e l'Excel.
  const primus = finale && d.tipo === "computo_metrico" ? fileDeliverable(output, d).filter((p) => /\.(xpwe|xlsx)$/.test(p)) : []
  const occupato = lavora(d)
  const inCorso = stadioInLavorazione(d) === s.id
  const prossimo = prossimoDaProdurre(d)
  const toastKo = (t: string) => (e: unknown) => toast.error(t, { description: comeApiError(e).message })

  const approva = () => az.approva.mutate({ id: d.id, stadio: s.id }, {
    onSuccess: () => toast.success(successivo ? `${s.etichetta} approvata: ${successivo.etichetta.toLowerCase()} in produzione.` : `${s.etichetta} approvato.`),
    onError: toastKo("Approvazione non riuscita"),
  })
  const chiediModifiche = () => az.modifica.mutate({ id: d.id, stadio: s.id, nota: nota.trim() }, {
    onSuccess: () => { toast.success(`Richiesta inviata: ${s.etichetta.toLowerCase()} in riscrittura.`); setNota(""); setModo("leggi") },
    onError: toastKo("Richiesta non inviata"),
  })
  const salva = () => {
    const fatto = () => az.salva.mutate({ id: d.id, stadio: s.id, testo: bozza }, {
      onSuccess: () => { toast.success("Modifiche salvate."); setModo("leggi") },
      onError: toastKo("Modifiche non salvate"),
    })
    const dopo = d.stadi.slice(i + 1).filter((x) => x.stato !== "da_produrre")
    if (dopo.length) setConferma({
      titolo: "Salvare le modifiche?", etichetta: "Salva",
      descrizione: `${dopo.map((x) => x.etichetta).join(" e ")} ${dopo.length === 1 ? "è stato prodotto" : "sono stati prodotti"} da questa versione: ${dopo.length === 1 ? "andrà rifatto" : "andranno rifatti"}.`,
      onConferma: fatto,
    })
    else fatto()
  }
  // Stadi precedenti non approvati: lo stadio non si può rifare (parte da quelli).
  const precedenteAperto = d.stadi.slice(0, i).find((x) => x.stato !== "approvato") || null
  const rifai = () => rifaiStadio(d, s)
  const esporta = (formato: "docx" | "pdf") => {
    // Si rigenera sempre dal definitivo attuale: il testo può essere cambiato a mano.
    const t = toast.loading(`Preparo il ${formato.toUpperCase()}…`)
    az.esporta.mutate({ id: d.id, formato }, {
      onSuccess: (r) => {
        // Il file arriva secondi dopo il clic: window.open a quel punto è un popup
        // non richiesto e il browser lo blocca in silenzio. Un link di download no;
        // il bottone nel messaggio resta come ripiego.
        const url = Api.scaricaOutput(slug, r.percorso)
        const scarica = () => { const a = document.createElement("a"); a.href = url; a.download = r.percorso.split("/").pop() || ""; document.body.append(a); a.click(); a.remove() }
        toast.success(`${formato.toUpperCase()} pronto.`, { id: t, action: { label: "Scarica", onClick: scarica }, duration: 15_000 })
        scarica()
      },
      onError: (e) => toast.error(`${formato.toUpperCase()} non generato`, { id: t, description: comeApiError(e).message }),
    })
  }

  if (inCorso) {
    return (
      <Card tono="run">
        <TitoloSezione azioni={d.job && <ControlloInterruzione job={d.job} compatto />}>{s.etichetta}: {d.job?.stato === "in_coda" ? "in coda" : "in lavorazione"}</TitoloSezione>
        <Avanzamento deliverable={d.id} attivo={d.stato === "in_esecuzione"} fallback={<p className="text-xs text-foreground-2">{d.job?.stato === "in_coda" ? "Parte appena il worker è libero." : "L'agente sta scrivendo questo stadio."}</p>} />
        <p className="mt-2 text-micro text-muted-foreground">Quando ha finito, il testo compare qui e lo approvi o chiedi modifiche.</p>
      </Card>
    )
  }
  if (s.stato === "da_produrre") {
    const tocca = prossimo?.id === s.id
    return (
      <Card>
        <VuotoInline titolo={`${s.etichetta}: non ancora prodotto`}
          testo={tocca ? (i === 0 ? "È il primo stadio: parte quando lo avvii." : "Lo stadio precedente è approvato: puoi produrlo.") : `Si produce dopo l'approvazione di «${d.stadi[i - 1]?.etichetta}».`}
          azione={tocca ? <Button disabled={!!blocco || occupato} title={blocco || undefined} onClick={() => avvia(d)}>Produci {s.etichetta.toLowerCase()}</Button> : undefined} />
        {dialogo}
      </Card>
    )
  }

  return (
    <Card tono={s.stato === "da_approvare" ? "attn" : s.stato === "superato" ? "attn" : undefined}>
      <TitoloSezione azioni={
        <div className="flex flex-wrap gap-1.5">
          {s.file && modo === "leggi" && <Button size="sm" variant="ghost" disabled={occupato || testo.isPending} onClick={() => { setBozza(testo.data || ""); setModo("modifica") }}><PencilSimpleIcon aria-hidden="true" />Modifica il testo</Button>}
          {s.file && <Button size="sm" variant="ghost" asChild><a href={Api.percorsoOutput(slug, s.file)} target="_blank" rel="noopener"><DownloadSimpleIcon aria-hidden="true" />.md</a></Button>}
        </div>
      }>
        {s.etichetta} <BadgeStato tono={STATO_STADIO[s.stato].tono} className="ml-1.5">{STATO_STADIO[s.stato].etichetta}</BadgeStato>
      </TitoloSezione>

      {s.stato === "superato" && <Nota tono="attn" titolo="Da rifare" className="mb-3">Uno stadio precedente è cambiato dopo questa versione. <Button size="sm" variant="outline" className="ml-2" disabled={!!blocco || occupato} onClick={() => avvia(d)}>Rifai {s.etichetta.toLowerCase()}</Button></Nota>}

      {modo === "modifica" ? (
        <div className="space-y-2">
          <Label htmlFor={`testo-${s.id}`}>Testo di «{s.etichetta}» (Markdown)</Label>
          <Textarea id={`testo-${s.id}`} value={bozza} onChange={(e) => setBozza(e.target.value)} className="min-h-[60vh] font-mono text-xs leading-relaxed" />
          <p className="text-micro text-muted-foreground">Le tue modifiche sono vincolanti per gli stadi successivi. Salvando, lo stadio torna da approvare.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!bozza.trim() || az.salva.isPending} onClick={salva}>{az.salva.isPending ? "Salvataggio" : "Salva le modifiche"}</Button>
            <Button variant="ghost" onClick={() => setModo("leggi")}>Annulla</Button>
          </div>
        </div>
      ) : testo.isPending ? <Scheletro righe={6} className="border-0 p-0" /> : testo.isError ? (
        <StatoErrore titolo="Testo non leggibile" errore={comeApiError(testo.error)} percorso={s.file || ""} onRiprova={() => void testo.refetch()} />
      ) : (
        <div className="max-h-[70vh] overflow-y-auto rounded-md border bg-background p-4">
          <Blocchi blocchi={blocchi(testo.data || "")} />
        </div>
      )}

      {modo === "nota" && (
        <form className="mt-3 space-y-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); if (nota.trim().length >= 3) chiediModifiche() }}>
          <Label htmlFor={`nota-${s.id}`}>Cosa deve cambiare in «{s.etichetta}»?</Label>
          <Textarea id={`nota-${s.id}`} rows={4} autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="es. Sposta C2 prima di C1; dai più spazio a P-C1-006; togli la premessa." />
          <p className="text-micro text-muted-foreground">L'agente riscrive questo stadio applicando solo la tua nota.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={nota.trim().length < 3 || az.modifica.isPending}>Invia la richiesta</Button>
            <Button type="button" variant="ghost" onClick={() => setModo("leggi")}>Annulla</Button>
          </div>
        </form>
      )}

      {modo === "leggi" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {s.stato === "da_approvare" && <Button disabled={!!blocco || occupato || az.approva.isPending} onClick={approva}><CheckIcon aria-hidden="true" />{successivo ? `Approva e produci ${successivo.etichetta.toLowerCase()}` : "Approva"}</Button>}
          {finale && (
            <>
              <Button variant={s.stato === "da_approvare" ? "outline" : "default"} disabled={az.esporta.isPending} onClick={() => esporta("docx")}><FileDocIcon aria-hidden="true" />Scarica DOCX</Button>
              <Button variant="outline" disabled={az.esporta.isPending} onClick={() => esporta("pdf")}><FilePdfIcon aria-hidden="true" />Scarica PDF</Button>
              {primus.map((p) => (
                <Button key={p} variant="outline" asChild>
                  <a href={Api.percorsoOutput(slug, p)} download>{p.endsWith(".xpwe")
                    ? <><FileArrowDownIcon aria-hidden="true" />PriMus (.xpwe)</>
                    : <><FileXlsIcon aria-hidden="true" />Excel per PriMus</>}</a>
                </Button>
              ))}
            </>
          )}
          <Button variant="outline" disabled={!!blocco || occupato} onClick={() => setModo("nota")}>Chiedi modifiche</Button>
          <Button variant="ghost" disabled={!!blocco || occupato || !!precedenteAperto} title={precedenteAperto ? `Prima approva «${precedenteAperto.etichetta}»` : "Riscrive questo stadio da zero con i dati attuali"} onClick={rifai}><ArrowCounterClockwiseIcon aria-hidden="true" />Rifai {s.etichetta.toLowerCase()}</Button>
          <span className="text-micro text-muted-foreground">{s.prodotto_il && `Prodotto ${quandoBreve(s.prodotto_il)}`}{s.approvato_il && s.stato === "approvato" && !finale ? `, approvato ${quandoBreve(s.approvato_il)}` : ""}</span>
        </div>
      )}
      {dialogo}
      <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />
    </Card>
  )
}

/** Documento senza procedimento a stadi: i file prodotti e l'anteprima del primo testo. */
function DocumentoSemplice({ d, blocco }: { d: Deliverable; blocco: string | null }) {
  const { slug, output } = useGara()
  const { avvia, daCapo, dialogo } = useAzioni()
  const file = fileDeliverable(output, d)
  const md = file.find((p) => p.endsWith(".md")) || null
  const testo = useTestoOutput(slug, md, d.stadi[0]?.prodotto_il)
  return (
    <Card tono={statoDel(d, !!blocco).tono}>
      <TitoloSezione azioni={
        <div className="flex flex-wrap gap-1.5">
          {d.job ? <ControlloInterruzione job={d.job} compatto /> : file.length ? <Button size="sm" variant="outline" disabled={!!blocco} onClick={() => daCapo(d)}>Rifai</Button> : <Button size="sm" disabled={!!blocco} title={blocco || undefined} onClick={() => avvia(d)}>Avvia</Button>}
          {file.slice(0, 3).map((p) => <Button key={p} size="sm" variant="outline" asChild><a href={Api.percorsoOutput(slug, p)} target="_blank" rel="noopener"><DownloadSimpleIcon aria-hidden="true" />{p.split("/").pop()}</a></Button>)}
        </div>
      }>{file.length ? "Documento prodotto" : "Documento non ancora prodotto"}</TitoloSezione>
      {d.stato === "in_esecuzione" && <Avanzamento deliverable={d.id} attivo fallback={null} className="mb-3" />}
      {!md ? <VuotoInline titolo="Nessun testo da mostrare" testo={file.length ? "Il documento non ha una parte in prosa da anteprimare: aprilo dal file." : "Il testo compare qui quando il deliverable viene eseguito."} />
        : testo.isPending ? <Scheletro righe={5} className="border-0 p-0" />
          : <div className="max-h-[70vh] overflow-y-auto rounded-md border bg-background p-4"><Blocchi blocchi={blocchi(testo.data || "")} /></div>}
      {dialogo}
    </Card>
  )
}

export function Fase7Workspace() {
  const { slug, gara } = useGara()
  const { id = "" } = useParams()
  const q = useDeliverables(slug)
  const { daCapo, rifaiStadio, dialogo } = useAzioni()
  const d = (q.data || []).find((x) => x.id === id) || null
  const blocco = motivoBlocco(gara.fasi, 7)
  const st = d ? statoDel(d, !!blocco) : STATO_DEL.da_eseguire
  // Stadio mostrato: quello scelto, altrimenti quello che chiede attenzione.
  const [scelto, setScelto] = useState<string | null>(null)
  const predefinito = d ? (stadioInLavorazione(d) || inAttesa(d)?.id || [...d.stadi].reverse().find((s) => s.stato !== "da_produrre")?.id || d.stadi[0]?.id) : null
  const sel = d?.stadi.find((s) => s.id === (scelto || predefinito)) || null
  const testata = <TestataVista kicker="Fase 7, deliverable" titolo={d?.nome || id} sottotitolo={d ? `${d.trasversale ? "Documento unico per tutti i criteri" : `Criteri ${d.criteri.join(", ")}`}${d.fonte ? `, ${d.fonte}` : ""}` : "Deliverable non trovato fra quelli richiesti."} badge={d ? st : undefined} indietro={{ a: "../fase/7", etichetta: "Tutti i deliverable" }} />

  if (q.isPending) return <>{testata}<Scheletro righe={4} /></>
  if (!d) return <>{testata}<Card><VuotoInline titolo="Deliverable non trovato" testo={`Nessun deliverable con id ${id}: l'elenco ora raggruppa i documenti per tutta l'offerta, non per criterio.`} azione={<Button variant="outline" asChild><Link to="../fase/7">Torna a tutti i deliverable</Link></Button>} /></Card></>

  return (
    <>
      {testata}
      <Split aside={
        <>
          <Card>
            <TitoloSezione>Assegnazione</TitoloSezione>
            <Kv voci={[["Agente", d.agente, true], ["Procedimento", d.skill || "agente generico, senza stadi", !!d.skill], ["Criteri", d.trasversale ? `tutti (${d.criteri.join(", ")})` : d.criteri.join(", "), true], ["Fonte", d.fonte || "non indicata"], ["Modello", gara.manifest.esecuzione?.modello || "n.d.", true]]} />
            {d.vincolo_formato && <p className="mt-3 text-micro text-foreground-2"><span className="font-medium text-foreground">Vincoli del disciplinare: </span>{d.vincolo_formato}</p>}
          </Card>
          {blocco && <Nota tono="neu" titolo="Produzione bloccata">{blocco}</Nota>}
          {d.stato === "da_rivedere" && !lavora(d) && (
            <Nota tono="attn" titolo="Da aggiornare">
              {d.nota || "Scritto prima delle ultime decisioni sulle proposte."} Rifallo da capo per ripartire dalle decisioni attuali, oppure rifai solo uno stadio dal riquadro «Rifai» qui sotto.
            </Nota>
          )}
          {d.errore && d.stato === "errore" && <Nota tono="crit" titolo="Ultima esecuzione non riuscita" role="alert">{d.errore}</Nota>}
          {!lavora(d) && d.stadi.some((s) => s.stato !== "da_produrre") && (
            <Card>
              <TitoloSezione>Rifai</TitoloSezione>
              {aStadi(d) ? (
                <>
                  <p className="mb-2 text-micro text-foreground-2">Rifai un solo stadio con le decisioni e i dati attuali: quelli prima restano approvati, quelli dopo restano ma vanno rivisti. Ogni versione sostituita viene archiviata.</p>
                  <div className="mb-3 grid gap-1.5">
                    {d.stadi.slice(1).map((s, k) => {
                      const aperto = d.stadi.slice(0, k + 1).find((x) => x.stato !== "approvato")
                      return <Button key={s.id} size="sm" variant="outline" className="w-full" disabled={!!blocco || !!aperto} title={blocco || (aperto ? `Prima approva «${aperto.etichetta}»` : `Riscrive solo «${s.etichetta}»`)} onClick={() => rifaiStadio(d, s)}>Solo {s.etichetta.toLowerCase()}</Button>
                    })}
                  </div>
                  <p className="mb-2 text-micro text-foreground-2">Da capo riparte da «{d.stadi[0]?.etichetta}» e archivia tutto il lavoro fatto finora.</p>
                </>
              ) : <p className="mb-2 text-micro text-foreground-2">Rigenera il documento con le decisioni e i dati attuali; quello attuale viene archiviato.</p>}
              <Button size="sm" variant="outline" className="w-full" disabled={!!blocco} onClick={() => daCapo(d)}>Rifai da capo</Button>
            </Card>
          )}
        </>
      }>
        {aStadi(d) ? (
          <>
            <nav aria-label="Stadi del documento" className="flex flex-wrap gap-2">
              {d.stadi.map((s, i) => {
                const inCorso = stadioInLavorazione(d) === s.id
                const t = inCorso ? { tono: "run" as Tono, etichetta: d.job?.stato === "in_coda" ? "In coda" : "In lavorazione" } : STATO_STADIO[s.stato]
                return (
                  <button key={s.id} type="button" aria-current={sel?.id === s.id ? "step" : undefined} onClick={() => setScelto(s.id)}
                    className={cn("flex min-w-[150px] flex-1 flex-col items-start gap-1 rounded-lg border bg-card px-3 py-2 text-left transition-colors duration-(--d-fast) hover:bg-muted", sel?.id === s.id && "border-foreground")}>
                    <span className="text-micro text-muted-foreground">Stadio {i + 1}</span>
                    <span className="text-sm font-semibold">{s.etichetta}</span>
                    <BadgeStato tono={t.tono} pulsa={inCorso && d.stato === "in_esecuzione"}>{t.etichetta}</BadgeStato>
                  </button>
                )
              })}
            </nav>
            {sel && <PannelloStadio key={sel.id} d={d} s={sel} blocco={blocco} />}
            {d.tipo === "relazione_tecnica" && <PannelloGrafiche d={d} />}
            {d.tipo === "relazione_tecnica" && <PannelloSchede d={d} />}
          </>
        ) : <DocumentoSemplice d={d} blocco={blocco} />}
      </Split>
      {dialogo}
    </>
  )
}
