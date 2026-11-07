// Figure della relazione tecnica (Fase 7). Per ogni proposta approvata il
// professionista chiede una o più figure e scrive cosa devono mostrare;
// Claude prepara prompt e didascalia leggendo proposta, gap ed elaborati;
// l'immagine si genera con OpenAI se la chiave c'è, altrimenti si copia il
// prompt in ChatGPT e si carica il file. Chi scrive la bozza colloca le
// figure nel testo; l'esportazione mette l'immagine al posto del segnaposto.

import { useEffect, useId, useRef, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { ArrowCounterClockwiseIcon, CopyIcon, CropIcon, DownloadSimpleIcon, ImageIcon, MagnifyingGlassIcon, XIcon, PencilSimpleIcon, PlusIcon, SparkleIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Card, Nota, Scheletro, Suggerimento, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { DialogoConferma, type Conferma } from "../DialogoConferma"
import { useGara } from "../GaraContext"
import { useAzioniGrafiche, useGrafiche, type Deliverable } from "@/hooks/useGaraDati"
import { Api, type ElencoGrafiche, type Grafica, type PropostaPerGrafica } from "@/lib/api"
import { plurale, quandoBreve } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import type { Tono } from "@/dominio/fasi"

const MIN_RICHIESTA = 10
const TIPI_IMMAGINE = ["image/png", "image/jpeg"]

/** Richieste pronte, costruite dal titolo della proposta: un clic le mette nel
    campo, dove si correggono. Coprono i tipi di vista più usati in relazione. */
function suggerimentiPer(titolo: string): { etichetta: string; testo: string }[] {
  const t = titolo.trim().replace(/[.\s]+$/, "")
  return [
    { etichetta: "Sezione costruttiva", testo: `Sezione costruttiva della soluzione proposta (${t}), con materiali, strati e quote principali` },
    { etichetta: "Esploso dei componenti", testo: `Esploso assonometrico dei componenti della soluzione proposta (${t}), con etichette brevi per ogni componente` },
    { etichetta: "Prima e dopo", testo: `Confronto affiancato tra la soluzione di progetto e la soluzione migliorativa (${t}), con le differenze evidenziate` },
    { etichetta: "Schema di funzionamento", testo: `Schema funzionale della soluzione proposta (${t}), con le fasi o i flussi principali indicati da frecce` },
  ]
}

/** Suggerimenti cliccabili sotto il campo della richiesta. */
function SuggerimentiRichiesta({ titolo, onScegli }: { titolo: string; onScegli: (testo: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Richieste suggerite">
      <span className="text-micro text-muted-foreground">Parti da:</span>
      {suggerimentiPer(titolo).map((x) => (
        <Button key={x.etichetta} type="button" size="sm" variant="outline" title={x.testo} onClick={() => onScegli(x.testo)}>{x.etichetta}</Button>
      ))}
    </div>
  )
}

function statoGrafica(g: Grafica): { tono: Tono; etichetta: string; pulsa?: boolean } {
  if (g.operazione?.tipo === "prompt") return { tono: "run", etichetta: "Prompt in preparazione", pulsa: true }
  if (g.operazione?.tipo === "immagine") return { tono: "run", etichetta: "Immagine in generazione", pulsa: true }
  if (g.errore) return { tono: "crit", etichetta: g.errore.operazione === "prompt" ? "Prompt non preparato" : "Immagine non generata" }
  if (!g.proposta_approvata) return { tono: "neu", etichetta: "Esclusa dal documento" }
  if (g.immagine) return { tono: "ok", etichetta: "Immagine pronta" }
  if (g.prompt) return { tono: "attn", etichetta: "Manca l'immagine" }
  return { tono: "neu", etichetta: "Manca il prompt" }
}

/** Il pannello delle figure, sotto lo stadio della relazione tecnica. */
export function PannelloGrafiche({ d }: { d: Deliverable }) {
  const { slug } = useGara()
  const q = useGrafiche(slug, d.id)
  const r = risorsa(q, { percorso: `/gare/${slug}/deliverables/${d.id}/grafiche` })

  if (r.stato === "caricamento") return <Scheletro righe={4} />
  if (r.stato === "assente" || (r.stato === "vuoto" && !r.dati)) return <Nota tono="neu" titolo="Figure non disponibili">Il backend in esecuzione è più vecchio dell'interfaccia: riavvia SPADA per usare le figure della relazione.</Nota>
  if (r.stato === "errore" || !r.dati) return <StatoErrore titolo="Figure non leggibili" errore={r.errore!} percorso={`deliverables/${d.id}/grafiche`} onRiprova={r.riprova} inCorso={q.isFetching} />
  return <ContenutoGrafiche d={d} dati={r.dati} />
}

function ContenutoGrafiche({ d, dati }: { d: Deliverable; dati: ElencoGrafiche }) {
  const { proposte, grafiche, openai, testi } = dati
  const attive = grafiche.filter((g) => g.proposta_approvata)
  const escluse = grafiche.filter((g) => !g.proposta_approvata)
  const conImmagine = attive.filter((g) => g.immagine).length
  const nonCollocate = (stadio: string) => (testi[stadio] ? attive.filter((g) => g.collocata[stadio] === false).length : 0)
  const fuoriBozza = nonCollocate("bozza")
  const fuoriDefinitivo = nonCollocate("definitivo")
  const perCriterio = proposte.reduce<Record<string, PropostaPerGrafica[]>>((acc, p) => ((acc[p.criterio] ||= []).push(p), acc), {})

  return (
    <Card aria-labelledby="h-grafiche">
      <TitoloSezione>
        <span id="h-grafiche">Figure della relazione</span>
        {attive.length > 0 && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{plurale(attive.length, "figura", "figure")}, {conImmagine} con immagine</span>}
      </TitoloSezione>
      <p className="mb-3 max-w-[65ch] text-xs text-foreground-2">
        Scegli per quali proposte serve una figura e scrivi cosa deve mostrare. Claude prepara il prompt leggendo proposta, gap ed elaborati.
        Conviene farlo prima di approvare la scaletta: chi scrive la bozza colloca le figure nel testo e le conta nel limite di facciate.
      </p>
      <Nota tono={openai.configurata ? "run" : "neu"} className="mb-3" titolo={openai.configurata ? `Generazione automatica con ${openai.modello}` : "Senza chiave OpenAI"}>
        {openai.configurata
          ? "L'immagine si genera da qui con il prompt della figura. Puoi sempre caricarne una tua."
          : <>Copia il prompt in ChatGPT, scarica l'immagine in PNG e caricala qui. Per generarla da qui inserisci la chiave nelle <Link className="text-primary underline underline-offset-2" to="../impostazioni">Impostazioni</Link>.</>}
      </Nota>
      {fuoriDefinitivo > 0 ? (
        <Nota tono="attn" className="mb-3" titolo={`${plurale(fuoriDefinitivo, "figura non è", "figure non sono")} nel definitivo`}>
          Sono state aggiunte dopo la scrittura del testo: all'esportazione non compaiono. Rifai la bozza per collocarle, poi il definitivo.
        </Nota>
      ) : fuoriBozza > 0 && (
        <Nota tono="attn" className="mb-3" titolo={`${plurale(fuoriBozza, "figura non è", "figure non sono")} nella bozza`}>
          Sono state aggiunte dopo la scrittura della bozza: rifai la bozza per collocarle nel testo.
        </Nota>
      )}

      {!proposte.length ? (
        <VuotoInline titolo="Nessuna proposta approvata" testo="Le figure si aggiungono alle proposte approvate nella Fase 6. Al momento non ce n'è nessuna." />
      ) : (
        <div className="space-y-5">
          {Object.entries(perCriterio).map(([criterio, lista]) => (
            <section key={criterio} aria-label={`Criterio ${criterio}`} className="space-y-3">
              <h4 className="text-xs font-semibold text-foreground-2">Criterio {criterio.replace(/^C/, "")}</h4>
              {lista.map((p) => <RigaProposta key={p.id} d={d} p={p} grafiche={grafiche.filter((g) => g.proposta_id === p.id)} openai={openai.configurata} />)}
            </section>
          ))}
          {escluse.length > 0 && (
            <section aria-label="Figure di proposte non più approvate" className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold text-foreground-2">Proposte non più approvate</h4>
              <p className="text-micro text-muted-foreground">Queste figure restano qui ma non entrano nel documento. Se la proposta torna approvata, ricompaiono al loro posto.</p>
              {escluse.map((g) => <CardGrafica key={g.id} d={d} g={g} openai={openai.configurata} />)}
            </section>
          )}
        </div>
      )}
    </Card>
  )
}

function RigaProposta({ d, p, grafiche, openai }: { d: Deliverable; p: PropostaPerGrafica; grafiche: Grafica[]; openai: boolean }) {
  const [nuova, setNuova] = useState(false)
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{p.titolo}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5"><Chip mono>{p.sottocriterio}</Chip>{grafiche.length > 0 && <Chip>{plurale(grafiche.length, "figura", "figure")}</Chip>}</div>
        </div>
        {!nuova && <Button size="sm" variant="outline" onClick={() => setNuova(true)}><PlusIcon aria-hidden="true" />Aggiungi figura</Button>}
      </div>
      {(grafiche.length > 0 || nuova) && (
        <div className="mt-3 space-y-3">
          {grafiche.map((g) => <CardGrafica key={g.id} d={d} g={g} openai={openai} titolo={p.titolo} />)}
          {nuova && <NuovaGrafica d={d} p={p} onChiudi={() => setNuova(false)} />}
        </div>
      )}
    </div>
  )
}

function NuovaGrafica({ d, p, onChiudi }: { d: Deliverable; p: PropostaPerGrafica; onChiudi: () => void }) {
  const { slug } = useGara()
  const az = useAzioniGrafiche(slug, d.id)
  const id = useId()
  const [testo, setTesto] = useState("")
  const campo = useRef<HTMLTextAreaElement>(null)
  const esempio = suggerimentiPer(p.titolo)[0].testo
  const valido = testo.trim().length >= MIN_RICHIESTA
  const scegli = (t: string) => {
    setTesto(t)
    // Il cursore va in fondo: di solito si completa o si corregge la coda della frase.
    requestAnimationFrame(() => { const el = campo.current; if (el) { el.focus(); el.setSelectionRange(t.length, t.length) } })
  }
  const invia = (poiPrompt: boolean) => az.crea.mutate({ proposta_id: p.id, richiesta: testo.trim() }, {
    onSuccess: (r) => {
      onChiudi()
      if (poiPrompt) az.prompt.mutate(r.id, { onError: (e) => toast.error("Prompt non avviato", { description: comeApiError(e).message }) })
    },
    onError: (e) => toast.error("Figura non aggiunta", { description: comeApiError(e).message }),
  })
  return (
    <form className="space-y-2 rounded-md border border-dashed p-3" onSubmit={(e) => { e.preventDefault(); if (valido) invia(true) }}>
      <Label htmlFor={`${id}-richiesta`}>Cosa deve mostrare la figura?</Label>
      <Textarea id={`${id}-richiesta`} ref={campo} rows={3} autoFocus value={testo} onChange={(e) => setTesto(e.target.value)}
        placeholder={esempio} aria-describedby={`${id}-aiuto`}
        onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey && !testo) { e.preventDefault(); scegli(esempio) } }} />
      <SuggerimentiRichiesta titolo={p.titolo} onScegli={scegli} />
      <Suggerimento id={`${id}-aiuto`}>Con il campo vuoto, Tab inserisce il testo d'esempio. Indica il tipo di vista e cosa deve risaltare: Claude completa con i dati degli elaborati.</Suggerimento>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!valido || az.crea.isPending}><SparkleIcon aria-hidden="true" />{az.crea.isPending ? "Aggiungo" : "Aggiungi e prepara il prompt"}</Button>
        <Button type="button" variant="outline" disabled={!valido || az.crea.isPending} onClick={() => invia(false)}>Aggiungi senza prompt</Button>
        <Button type="button" variant="ghost" onClick={onChiudi}>Annulla</Button>
      </div>
    </form>
  )
}

/** Area che accetta un file trascinato. dragenter/dragleave scattano anche
    sui figli: si contano, così l'evidenza non lampeggia. */
function useTrascinaFile(onFile: (f: File) => void, abilitato: boolean) {
  const [sopra, setSopra] = useState(false)
  const profondita = useRef(0)
  const conFile = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files")
  const props = {
    onDragEnter: (e: React.DragEvent) => { if (!conFile(e)) return; e.preventDefault(); e.stopPropagation(); profondita.current += 1; setSopra(true) },
    onDragOver: (e: React.DragEvent) => { if (!conFile(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = abilitato ? "copy" : "none" },
    onDragLeave: (e: React.DragEvent) => { if (!conFile(e)) return; e.stopPropagation(); profondita.current = Math.max(0, profondita.current - 1); if (!profondita.current) setSopra(false) },
    onDrop: (e: React.DragEvent) => {
      if (!conFile(e)) return
      e.preventDefault()
      e.stopPropagation()
      profondita.current = 0
      setSopra(false)
      const file = e.dataTransfer.files[0]
      if (!abilitato || !file) return
      if (e.dataTransfer.files.length > 1) toast.info("Si usa un file solo: prendo il primo.")
      onFile(file)
    },
  }
  return { sopra, props }
}

/** Copia negli appunti con la conferma sul bottone stesso. */
function BottoneCopia({ testo, etichetta = "Copia prompt", variant = "outline" }: { testo: string; etichetta?: string; variant?: "outline" | "default" }) {
  const [copiato, setCopiato] = useState(false)
  useEffect(() => { if (!copiato) return; const t = setTimeout(() => setCopiato(false), 2000); return () => clearTimeout(t) }, [copiato])
  const copia = async () => {
    try { await navigator.clipboard.writeText(testo); setCopiato(true) }
    catch { toast.error("Copia non riuscita", { description: "Il browser non consente l'accesso agli appunti: seleziona il testo del prompt e copialo a mano." }) }
  }
  return <Button size="sm" variant={variant} onClick={() => void copia()}><CopyIcon aria-hidden="true" />{copiato ? "Copiato" : etichetta}</Button>
}

type Campo = "richiesta" | "prompt" | "didascalia" | "prompt_riferimento"

function CardGrafica({ d, g, openai, titolo }: { d: Deliverable; g: Grafica; openai: boolean; titolo?: string }) {
  const { slug } = useGara()
  const az = useAzioniGrafiche(slug, d.id)
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [modifica, setModifica] = useState<null | Campo>(null)
  const [valore, setValore] = useState("")
  const [progresso, setProgresso] = useState<number | null>(null)
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const st = statoGrafica(g)
  const occupata = !!g.operazione
  const ko = (t: string) => (e: unknown) => toast.error(t, { description: comeApiError(e).message })

  const apri = (campo: Campo) => { setValore(g[campo]); setModifica(campo) }
  const salva = () => {
    if (!modifica) return
    az.aggiorna.mutate({ gid: g.id, [modifica]: valore.trim() }, { onSuccess: () => setModifica(null), onError: ko("Modifica non salvata") })
  }
  const preparaPrompt = () => az.prompt.mutate(g.id, { onError: ko("Prompt non avviato") })
  const altroRiferimento = () => setConferma({
    titolo: "Cercare un altro riferimento?", etichetta: "Cerca un altro",
    descrizione: "Claude prepara di nuovo il prompt escludendo il riferimento attuale, che viene archiviato. Le tue correzioni al prompt e alla didascalia vengono sostituite.",
    onConferma: () => az.prompt.mutate({ gid: g.id, altroRiferimento: true }, { onError: ko("Ricerca non avviata") }),
  })
  const rifaiPrompt = () => setConferma({
    titolo: "Preparare di nuovo il prompt?", etichetta: "Prepara di nuovo",
    descrizione: "Claude riscrive prompt e didascalia dalla richiesta attuale. Le tue correzioni al prompt e alla didascalia vengono sostituite.",
    onConferma: preparaPrompt,
  })
  const genera = () => {
    const fai = () => az.genera.mutate(g.id, { onError: ko("Generazione non avviata") })
    if (g.immagine) setConferma({ titolo: "Generare una nuova immagine?", etichetta: "Genera", descrizione: "L'immagine attuale viene archiviata, non cancellata. La generazione con OpenAI ha un costo per immagine.", onConferma: fai })
    else fai()
  }
  const puoCaricare = !occupata && progresso === null
  const carica = (file: File) => {
    if (!TIPI_IMMAGINE.includes(file.type)) {
      toast.error("Immagine non caricata", { description: `«${file.name}» non è un PNG o un JPG: il documento Word non accetta altri formati. Da ChatGPT scaricala come PNG.` })
      return
    }
    setProgresso(0)
    az.carica.mutate({ gid: g.id, file, suProgresso: setProgresso }, {
      onSuccess: () => toast.success("Immagine caricata."),
      onError: ko("Immagine non caricata"),
      onSettled: () => setProgresso(null),
    })
  }
  const { sopra, props: trascinamento } = useTrascinaFile(carica, puoCaricare)
  const elimina = () => setConferma({
    titolo: "Eliminare la figura?", etichetta: "Elimina", distruttiva: true,
    descrizione: `La figura «${g.richiesta.slice(0, 80)}${g.richiesta.length > 80 ? "…" : ""}» esce dall'elenco e dalle prossime stesure. L'immagine viene archiviata, non cancellata. Se il testo la cita già, togli il segnaposto o rifai la bozza.`,
    onConferma: () => az.elimina.mutate(g.id, { onError: ko("Figura non eliminata") }),
  })

  const editor = (campo: Campo, etichetta: string, righe: number, aiuto?: string) => (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); salva() }}>
      <Label htmlFor={`${id}-${campo}`}>{etichetta}</Label>
      {campo === "didascalia"
        ? <Input id={`${id}-${campo}`} autoFocus value={valore} maxLength={400} onChange={(e) => setValore(e.target.value)} />
        : <Textarea id={`${id}-${campo}`} autoFocus rows={righe} value={valore} onChange={(e) => setValore(e.target.value)} className={campo === "prompt" || campo === "prompt_riferimento" ? "font-mono text-xs leading-relaxed" : undefined} />}
      {campo === "richiesta" && titolo && <SuggerimentiRichiesta titolo={titolo} onScegli={setValore} />}
      {aiuto && <Suggerimento>{aiuto}</Suggerimento>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={az.aggiorna.isPending || (campo === "richiesta" && valore.trim().length < MIN_RICHIESTA)}>{az.aggiorna.isPending ? "Salvataggio" : "Salva"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setModifica(null)}>Annulla</Button>
      </div>
    </form>
  )

  return (
    <article className="rounded-md border bg-background p-3" aria-labelledby={`${id}-titolo`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h5 id={`${id}-titolo`} className="text-xs font-semibold">Figura <span className="font-mono font-normal text-muted-foreground">{g.id}</span></h5>
          <BadgeStato tono={st.tono} pulsa={st.pulsa}>{st.etichetta}</BadgeStato>
        </div>
        <Button size="sm" variant="ghost" disabled={occupata || az.elimina.isPending} onClick={elimina} aria-label={`Elimina la figura ${g.id}`}><TrashIcon aria-hidden="true" />Elimina</Button>
      </div>

      {/* Richiesta del professionista */}
      {modifica === "richiesta" ? editor("richiesta", "Cosa deve mostrare la figura?", 3, "Dopo la modifica prepara di nuovo il prompt.") : (
        <div className="flex items-start justify-between gap-2">
          <p className="max-w-[65ch] text-sm text-foreground-2"><span className="text-foreground">Richiesta: </span>{g.richiesta}</p>
          <Button size="sm" variant="ghost" disabled={occupata} onClick={() => apri("richiesta")} aria-label="Modifica la richiesta"><PencilSimpleIcon aria-hidden="true" /></Button>
        </div>
      )}

      {g.errore && (
        <Nota tono="crit" role="alert" className="mt-3" titolo={g.errore.operazione === "prompt" ? "Prompt non preparato" : "Immagine non generata"}
          azioni={<>
            <Button size="sm" variant="outline" onClick={g.errore.operazione === "prompt" ? preparaPrompt : genera}><ArrowCounterClockwiseIcon aria-hidden="true" />Riprova</Button>
            {g.errore.tipo === "chiave" || g.errore.tipo === "modello" ? <Button size="sm" variant="outline" asChild><Link to="../impostazioni">Apri le impostazioni</Link></Button> : null}
            {g.errore.operazione === "immagine" && g.prompt && <BottoneCopia testo={g.prompt_effettivo} etichetta="Copia il prompt per ChatGPT" />}
          </>}>
          {g.errore.messaggio}
        </Nota>
      )}

      {/* Prompt */}
      <div className="mt-3 border-t pt-3">
        {g.operazione?.tipo === "prompt" ? (
          <div aria-live="polite">
            <p className="text-xs text-foreground-2">Claude sta leggendo proposta, gap ed elaborati, e cerca un'immagine di riferimento. Di solito servono da 1 a 4 minuti: puoi continuare a lavorare.</p>
            <Skeleton className="mt-2 h-16" />
          </div>
        ) : modifica === "prompt" ? editor("prompt", "Prompt per il modello d'immagine", 10, "In inglese, i modelli d'immagine lo seguono meglio. Le etichette da scrivere nell'immagine vanno tra virgolette, in italiano.") : g.prompt ? (
          <>
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold">Prompt <span className="font-normal text-muted-foreground">{g.prompt_preparato_il ? `preparato ${quandoBreve(g.prompt_preparato_il)}` : "scritto a mano"}</span></summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-3 font-mono text-micro leading-relaxed text-foreground-2">{g.prompt_effettivo || g.prompt}</pre>
            </details>
            {g.note_prompt && <p className="mt-1.5 max-w-[65ch] text-micro text-muted-foreground">{g.note_prompt}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <BottoneCopia testo={g.prompt_effettivo} variant={openai ? "outline" : "default"} />
              <Button size="sm" variant="ghost" disabled={occupata} onClick={() => apri("prompt")}><PencilSimpleIcon aria-hidden="true" />Modifica</Button>
              <Button size="sm" variant="ghost" disabled={occupata || az.prompt.isPending} onClick={rifaiPrompt}><ArrowCounterClockwiseIcon aria-hidden="true" />Prepara di nuovo</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={occupata || az.prompt.isPending} onClick={preparaPrompt}><SparkleIcon aria-hidden="true" />Prepara il prompt</Button>
            <Button size="sm" variant="ghost" onClick={() => apri("prompt")}>Scrivilo a mano</Button>
          </div>
        )}
      </div>

      {/* Riferimento: immagine da cui partire, non entra nel documento */}
      {g.operazione?.tipo !== "prompt" && (
        <SezioneRiferimento d={d} g={g} openai={openai} occupata={occupata} modifica={modifica} editor={editor}
          apri={apri} preparaPrompt={preparaPrompt} altroRiferimento={altroRiferimento} />
      )}

      {/* Didascalia */}
      {(g.prompt || g.didascalia || modifica === "didascalia") && g.operazione?.tipo !== "prompt" && (
        <div className="mt-3 border-t pt-3">
          {modifica === "didascalia" ? editor("didascalia", "Didascalia", 1, "Finisce nel documento sotto la figura, dopo «Figura N». Niente codici interni.") : (
            <div className="flex items-start justify-between gap-2">
              <p className="max-w-[65ch] text-xs text-foreground-2"><span className="font-semibold text-foreground">Didascalia: </span>{g.didascalia || <span className="text-muted-foreground">non ancora scritta</span>}</p>
              <Button size="sm" variant="ghost" disabled={occupata} onClick={() => apri("didascalia")} aria-label="Modifica la didascalia"><PencilSimpleIcon aria-hidden="true" /></Button>
            </div>
          )}
          {g.avvisi.map((a) => <Suggerimento key={a} tono="attn">{a}</Suggerimento>)}
        </div>
      )}

      {/* Immagine: si carica anche trascinando il file sull'area */}
      <div className="mt-3 border-t pt-3" {...trascinamento}>
        {g.operazione?.tipo === "immagine" ? (
          <div aria-live="polite">
            <Skeleton className="aspect-[3/2] w-full max-w-md" />
            <p className="mt-2 text-xs text-foreground-2">OpenAI sta generando l'immagine: di solito meno di un minuto.</p>
          </div>
        ) : g.immagine ? (
          <figure className="relative max-w-md">
            <a href={Api.urlImmagineGrafica(slug, d.id, g.id, g.immagine.caricata_il)} target="_blank" rel="noopener">
              <img src={Api.urlImmagineGrafica(slug, d.id, g.id, g.immagine.caricata_il)} alt={g.didascalia || g.richiesta} className="aspect-[3/2] w-full rounded-md border bg-card object-contain" />
            </a>
            <figcaption className="mt-1 text-micro text-muted-foreground">{g.immagine.origine === "openai" ? `Generata con ${g.immagine.modello || "OpenAI"}` : "Caricata"} {quandoBreve(g.immagine.caricata_il)}. Trascina qui un file per sostituirla.</figcaption>
            {sopra && (
              <div className={cn("pointer-events-none absolute inset-x-0 top-0 flex aspect-[3/2] items-center justify-center rounded-md border-2 border-dashed text-sm font-medium", puoCaricare ? "border-primary bg-card text-primary" : "border-border-strong bg-muted text-muted-foreground")}>
                {puoCaricare ? "Rilascia per sostituire l'immagine" : "Aspetta che finisca l'operazione in corso"}
              </div>
            )}
          </figure>
        ) : (
          <div className={cn("flex aspect-[3/2] w-full max-w-md flex-col items-center justify-center gap-1 rounded-md border border-dashed text-center transition-colors duration-(--d-fast) ease-(--e-std)",
            sopra && (puoCaricare ? "border-2 border-primary bg-primary-soft" : "bg-muted"))}>
            <ImageIcon size={20} className={sopra && puoCaricare ? "text-primary" : "text-muted-foreground"} aria-hidden="true" />
            <span className={cn("text-xs", sopra && puoCaricare ? "font-medium text-primary" : "text-foreground-2")}>{sopra ? (puoCaricare ? "Rilascia per caricare l'immagine" : "Aspetta che finisca l'operazione in corso") : "Nessuna immagine"}</span>
            {!sopra && <span className="max-w-[36ch] text-micro text-muted-foreground">{!g.prompt ? "Prepara il prompt, oppure trascina qui un'immagine che hai già." : openai ? "Generala da qui, oppure trascina qui un PNG o un JPG." : "Copia il prompt in ChatGPT, poi trascina qui il PNG scaricato."}</span>}
          </div>
        )}
        {progresso !== null && (
          <div className="mt-2 max-w-md" role="progressbar" aria-label="Caricamento dell'immagine" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progresso * 100)}>
            <div className="h-1 overflow-hidden rounded-[1px] bg-muted"><div className="h-full origin-left bg-status-run transition-transform duration-(--d-base) ease-(--e-std)" style={{ transform: `scaleX(${progresso})` }} /></div>
            <span className="text-micro text-muted-foreground">Caricamento <span className="font-mono">{Math.round(progresso * 100)}%</span></span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {openai && <Button size="sm" variant={g.immagine ? "outline" : "default"} disabled={occupata || !g.prompt || az.genera.isPending} title={!g.prompt ? "Prima prepara il prompt" : undefined} onClick={genera}><SparkleIcon aria-hidden="true" />{g.immagine ? "Genera di nuovo" : "Genera immagine"}</Button>}
          <Button size="sm" variant="outline" disabled={occupata || progresso !== null} onClick={() => fileRef.current?.click()}><UploadSimpleIcon aria-hidden="true" />{g.immagine ? "Sostituisci con un file" : "Carica immagine"}</Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) carica(f) }} />
        </div>
      </div>
      <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />
    </article>
  )
}

type Riquadro = [number, number, number, number]

function SezioneRiferimento({ d, g, openai, occupata, modifica, editor, apri, preparaPrompt, altroRiferimento }: {
  d: Deliverable; g: Grafica; openai: boolean; occupata: boolean; modifica: Campo | null
  editor: (campo: Campo, etichetta: string, righe: number, aiuto?: string) => React.ReactNode
  apri: (campo: Campo) => void; preparaPrompt: () => void; altroRiferimento: () => void
}) {
  const { slug } = useGara()
  const az = useAzioniGrafiche(slug, d.id)
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [ritaglio, setRitaglio] = useState(false)
  const [progresso, setProgresso] = useState<number | null>(null)
  const r = g.riferimento
  const libero = !occupata && progresso === null
  const ko = (t: string) => (e: unknown) => toast.error(t, { description: comeApiError(e).message })
  const carica = (file: File) => {
    if (!TIPI_IMMAGINE.includes(file.type)) {
      toast.error("Riferimento non caricato", { description: `«${file.name}» non è un PNG o un JPG.` })
      return
    }
    setProgresso(0)
    az.caricaRiferimento.mutate({ gid: g.id, file, suProgresso: setProgresso }, {
      onSuccess: () => toast.success("Riferimento caricato."), onError: ko("Riferimento non caricato"), onSettled: () => setProgresso(null),
    })
  }
  const { sopra, props } = useTrascinaFile(carica, libero)
  const url = r ? Api.urlRiferimentoGrafica(slug, d.id, g.id, r.impostato_il) : ""
  const fonte = r?.origine === "elaborato" ? `${r.fonte || "Elaborato"}${r.pagina ? `, pagina ${r.pagina}` : ""}` : "Caricato da te"
  const input = <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden="true"
    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) carica(f) }} />

  return (
    <div className="mt-3 border-t pt-3" {...props} aria-labelledby={`${id}-rif`}>
      <h6 id={`${id}-rif`} className="mb-1.5 text-xs font-semibold">Riferimento <span className="font-normal text-muted-foreground">immagine da cui partire, non entra nel documento</span></h6>
      {r ? (
        <div className="flex flex-wrap items-start gap-3">
          <a href={url} target="_blank" rel="noopener" className="relative block w-full max-w-60 shrink-0">
            <img src={url} alt={`Riferimento: ${fonte}`} className={cn("max-h-44 w-full rounded-md border bg-card object-contain", !g.usa_riferimento && "opacity-50")} />
            {sopra && <span className={cn("pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed bg-card text-center text-xs font-medium", libero ? "border-primary text-primary" : "border-border-strong text-muted-foreground")}>{libero ? "Rilascia per sostituire il riferimento" : "Aspetta che finisca l'operazione in corso"}</span>}
          </a>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs text-foreground-2"><span className="font-medium text-foreground">{fonte}</span>{r.motivo && <>. {r.motivo}</>}</p>
            {r.cambiato_dopo_prompt && (
              <Nota tono="attn" titolo="Il prompt è stato scritto per il riferimento precedente" azioni={<Button size="sm" variant="outline" disabled={occupata} onClick={preparaPrompt}><ArrowCounterClockwiseIcon aria-hidden="true" />Prepara di nuovo</Button>}>
                Preparalo di nuovo perché Claude guardi quello attuale, oppure correggi a mano l'istruzione qui sotto.
              </Nota>
            )}
            <div className="flex items-center gap-2">
              <Checkbox id={`${id}-usa`} checked={g.usa_riferimento} disabled={occupata || az.aggiorna.isPending}
                onCheckedChange={(v) => az.aggiorna.mutate({ gid: g.id, usa_riferimento: v === true }, { onError: ko("Scelta non salvata") })} />
              <Label htmlFor={`${id}-usa`} className="text-xs font-normal">Usa il riferimento nella generazione</Label>
            </div>
            {g.usa_riferimento && !openai && g.prompt && <Suggerimento>In ChatGPT allega questa immagine insieme al prompt: il prompt copiato già dice come usarla.</Suggerimento>}
            {modifica === "prompt_riferimento" ? editor("prompt_riferimento", "Come usare il riferimento (in inglese, si aggiunge al prompt)", 4) : g.usa_riferimento && (
              <details>
                <summary className="cursor-pointer text-micro text-muted-foreground">Istruzione aggiunta al prompt</summary>
                <p className="mt-1 font-mono text-micro leading-relaxed text-foreground-2">{g.prompt_riferimento || "Use the attached image as a visual reference for layout, proportions and viewpoint. Where the attached image and the text differ, follow the text."}</p>
                <Button size="sm" variant="ghost" className="mt-1" disabled={occupata} onClick={() => apri("prompt_riferimento")}><PencilSimpleIcon aria-hidden="true" />Modifica</Button>
              </details>
            )}
            <div className="flex flex-wrap gap-1.5">
              {r.origine === "elaborato" && <Button size="sm" variant="outline" disabled={!libero} onClick={() => setRitaglio(true)}><CropIcon aria-hidden="true" />Regola il ritaglio</Button>}
              <Button size="sm" variant="outline" asChild><a href={url} download={`riferimento-${g.id}`}><DownloadSimpleIcon aria-hidden="true" />Scarica</a></Button>
              <Button size="sm" variant="ghost" disabled={!libero} onClick={() => fileRef.current?.click()}><UploadSimpleIcon aria-hidden="true" />Sostituisci con un file</Button>
              {r.origine === "elaborato" && <Button size="sm" variant="ghost" disabled={!libero || az.prompt.isPending} onClick={altroRiferimento}><MagnifyingGlassIcon aria-hidden="true" />Cerca un altro</Button>}
              <Button size="sm" variant="ghost" disabled={!libero || az.togliRiferimento.isPending}
                onClick={() => az.togliRiferimento.mutate(g.id, { onSuccess: () => toast.success("Riferimento tolto."), onError: ko("Riferimento non tolto") })}><XIcon aria-hidden="true" />Togli</Button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!libero} onClick={() => fileRef.current?.click()}
          className={cn("flex w-full max-w-md flex-col items-center gap-0.5 rounded-md border border-dashed px-3 py-3 text-center transition-colors duration-(--d-fast) ease-(--e-std) hover:bg-muted disabled:pointer-events-none disabled:opacity-60",
            sopra && libero && "border-2 border-primary bg-primary-soft")}>
          <span className={cn("text-xs", sopra && libero ? "font-medium text-primary" : "text-foreground-2")}>
            {sopra ? (libero ? "Rilascia per usarla come riferimento" : "Aspetta che finisca l'operazione in corso") : g.prompt_preparato_il ? "Negli elaborati non c'è un'immagine adatta" : "Claude la cerca negli elaborati quando prepara il prompt"}
          </span>
          {!sopra && <span className="text-micro text-muted-foreground">Trascina qui un'immagine tua, o clicca per sceglierla.</span>}
        </button>
      )}
      {progresso !== null && (
        <div className="mt-2 max-w-md" role="progressbar" aria-label="Caricamento del riferimento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progresso * 100)}>
          <div className="h-1 overflow-hidden rounded-[1px] bg-muted"><div className="h-full origin-left bg-status-run transition-transform duration-(--d-base) ease-(--e-std)" style={{ transform: `scaleX(${progresso})` }} /></div>
        </div>
      )}
      {input}
      {ritaglio && r?.riquadro && <DialogoRitaglio d={d} g={g} iniziale={r.riquadro} onChiudi={() => setRitaglio(false)} />}
    </div>
  )
}

const RIQ_MIN = 0.03

/** Pagina intera dell'elaborato con il rettangolo del ritaglio: si sposta
    trascinandolo, si ridimensiona dagli angoli, da tastiera con le frecce
    (Maiusc per ridimensionare). */
function DialogoRitaglio({ d, g, iniziale, onChiudi }: { d: Deliverable; g: Grafica; iniziale: Riquadro; onChiudi: () => void }) {
  const { slug } = useGara()
  const az = useAzioniGrafiche(slug, d.id)
  const [riq, setRiq] = useState<Riquadro>(iniziale)
  const [caricata, setCaricata] = useState(false)
  const [errore, setErrore] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  const trascina = useRef<{ modo: string; x: number; y: number; da: Riquadro } | null>(null)
  const url = Api.urlPaginaRiferimento(slug, d.id, g.id, g.riferimento?.impostato_il || "")
  const limita = (v: number) => Math.min(1, Math.max(0, v))

  const muovi = (modo: string, dx: number, dy: number, da: Riquadro): Riquadro => {
    let [x0, y0, x1, y1] = da
    if (modo === "sposta") {
      const w = x1 - x0, h = y1 - y0
      x0 = Math.min(1 - w, Math.max(0, x0 + dx)); y0 = Math.min(1 - h, Math.max(0, y0 + dy))
      return [x0, y0, x0 + w, y0 + h]
    }
    if (modo.includes("o")) x0 = Math.min(x1 - RIQ_MIN, limita(x0 + dx))
    if (modo.includes("e")) x1 = Math.max(x0 + RIQ_MIN, limita(x1 + dx))
    if (modo.includes("n")) y0 = Math.min(y1 - RIQ_MIN, limita(y0 + dy))
    if (modo.includes("s")) y1 = Math.max(y0 + RIQ_MIN, limita(y1 + dy))
    return [x0, y0, x1, y1]
  }
  const inizio = (modo: string) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    trascina.current = { modo, x: e.clientX, y: e.clientY, da: riq }
  }
  const sposta = (e: React.PointerEvent) => {
    const t = trascina.current, el = area.current
    if (!t || !el) return
    const b = el.getBoundingClientRect()
    setRiq(muovi(t.modo, (e.clientX - t.x) / b.width, (e.clientY - t.y) / b.height, t.da))
  }
  const fine = () => { trascina.current = null }
  const tastiera = (e: React.KeyboardEvent) => {
    const passo = 0.01
    const dir: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }
    const v = dir[e.key]
    if (!v) return
    e.preventDefault()
    setRiq((q) => muovi(e.shiftKey ? "se" : "sposta", v[0], v[1], q))
  }
  const salva = () => az.ritaglia.mutate({ gid: g.id, riquadro: riq }, {
    onSuccess: () => { toast.success("Ritaglio aggiornato."); onChiudi() },
    onError: (e) => toast.error("Ritaglio non salvato", { description: comeApiError(e).message }),
  })
  const [x0, y0, x1, y1] = riq
  const angoli: [string, string][] = [["no", "-left-1.5 -top-1.5 cursor-nwse-resize"], ["ne", "-right-1.5 -top-1.5 cursor-nesw-resize"], ["so", "-bottom-1.5 -left-1.5 cursor-nesw-resize"], ["se", "-bottom-1.5 -right-1.5 cursor-nwse-resize"]]

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChiudi() }}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Regola il ritaglio del riferimento</DialogTitle>
          <DialogDescription>{g.riferimento?.fonte}{g.riferimento?.pagina ? `, pagina ${g.riferimento.pagina}` : ""}. Sposta il rettangolo trascinandolo e ridimensionalo dagli angoli. Da tastiera: frecce per spostarlo, Maiusc e frecce per ridimensionarlo.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto rounded-md border bg-muted">
          {errore ? (
            <div className="p-6"><Nota tono="crit" titolo="Pagina non leggibile">La pagina dell'elaborato non si apre: carica un riferimento tuo dalla figura.</Nota></div>
          ) : (
            <div ref={area} className="relative select-none touch-none" onPointerMove={sposta} onPointerUp={fine} onPointerCancel={fine}>
              {!caricata && <Skeleton className="aspect-[1.41] w-full" />}
              <img src={url} alt="Pagina dell'elaborato" draggable={false} onLoad={() => setCaricata(true)} onError={() => setErrore(true)} className={cn("block w-full", !caricata && "hidden")} />
              {caricata && (
                <div role="slider" tabIndex={0} aria-label="Riquadro del ritaglio" aria-valuetext={`da ${Math.round(x0 * 100)}% ${Math.round(y0 * 100)}% a ${Math.round(x1 * 100)}% ${Math.round(y1 * 100)}%`}
                  onKeyDown={tastiera} onPointerDown={inizio("sposta")}
                  className="absolute cursor-move border-2 border-primary bg-primary-soft outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }}>
                  {angoli.map(([m, pos]) => <span key={m} onPointerDown={inizio(m)} className={cn("absolute size-3 rounded-[2px] border-2 border-primary bg-card", pos)} aria-hidden="true" />)}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setRiq(iniziale)}>Ripristina</Button>
          <Button type="button" variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button type="button" disabled={!caricata || az.ritaglia.isPending} onClick={salva}>{az.ritaglia.isPending ? "Ritaglio" : "Usa questo ritaglio"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
