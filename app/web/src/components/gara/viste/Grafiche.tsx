// Figure della relazione tecnica (Fase 7). Per ogni proposta approvata il
// professionista chiede una o più figure e scrive cosa devono mostrare;
// Claude prepara prompt e didascalia leggendo proposta, gap ed elaborati;
// l'immagine si genera con OpenAI se la chiave c'è, altrimenti si copia il
// prompt in ChatGPT e si carica il file. Chi scrive la bozza colloca le
// figure nel testo; l'esportazione mette l'immagine al posto del segnaposto.

import { useEffect, useId, useRef, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { ArrowCounterClockwiseIcon, CopyIcon, ImageIcon, PencilSimpleIcon, PlusIcon, SparkleIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Card, Nota, Scheletro, Suggerimento, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { DialogoConferma, type Conferma } from "../DialogoConferma"
import { useGara } from "../GaraContext"
import { useAzioniGrafiche, useGrafiche, type Deliverable } from "@/hooks/useGaraDati"
import { Api, type ElencoGrafiche, type Grafica, type PropostaPerGrafica } from "@/lib/api"
import { plurale, quandoBreve } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import type { Tono } from "@/dominio/fasi"

const MIN_RICHIESTA = 10

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
          {grafiche.map((g) => <CardGrafica key={g.id} d={d} g={g} openai={openai} />)}
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
  const valido = testo.trim().length >= MIN_RICHIESTA
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
      <Textarea id={`${id}-richiesta`} rows={3} autoFocus value={testo} onChange={(e) => setTesto(e.target.value)}
        placeholder="Es. sezione della parete divisoria con il pannello compatto e la ferramenta inox, con le quote principali" />
      <Suggerimento>Indica il tipo di vista (sezione, esploso, schema, pianta) e cosa deve risaltare. Claude completa con i dati degli elaborati.</Suggerimento>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!valido || az.crea.isPending}><SparkleIcon aria-hidden="true" />{az.crea.isPending ? "Aggiungo" : "Aggiungi e prepara il prompt"}</Button>
        <Button type="button" variant="outline" disabled={!valido || az.crea.isPending} onClick={() => invia(false)}>Aggiungi senza prompt</Button>
        <Button type="button" variant="ghost" onClick={onChiudi}>Annulla</Button>
      </div>
    </form>
  )
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

function CardGrafica({ d, g, openai }: { d: Deliverable; g: Grafica; openai: boolean }) {
  const { slug } = useGara()
  const az = useAzioniGrafiche(slug, d.id)
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [modifica, setModifica] = useState<null | "richiesta" | "prompt" | "didascalia">(null)
  const [valore, setValore] = useState("")
  const [progresso, setProgresso] = useState<number | null>(null)
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const st = statoGrafica(g)
  const occupata = !!g.operazione
  const ko = (t: string) => (e: unknown) => toast.error(t, { description: comeApiError(e).message })

  const apri = (campo: "richiesta" | "prompt" | "didascalia") => { setValore(g[campo]); setModifica(campo) }
  const salva = () => {
    if (!modifica) return
    az.aggiorna.mutate({ gid: g.id, [modifica]: valore.trim() }, { onSuccess: () => setModifica(null), onError: ko("Modifica non salvata") })
  }
  const preparaPrompt = () => az.prompt.mutate(g.id, { onError: ko("Prompt non avviato") })
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
  const carica = (file: File) => {
    setProgresso(0)
    az.carica.mutate({ gid: g.id, file, suProgresso: setProgresso }, {
      onSuccess: () => toast.success("Immagine caricata."),
      onError: ko("Immagine non caricata"),
      onSettled: () => setProgresso(null),
    })
  }
  const elimina = () => setConferma({
    titolo: "Eliminare la figura?", etichetta: "Elimina", distruttiva: true,
    descrizione: `La figura «${g.richiesta.slice(0, 80)}${g.richiesta.length > 80 ? "…" : ""}» esce dall'elenco e dalle prossime stesure. L'immagine viene archiviata, non cancellata. Se il testo la cita già, togli il segnaposto o rifai la bozza.`,
    onConferma: () => az.elimina.mutate(g.id, { onError: ko("Figura non eliminata") }),
  })

  const editor = (campo: "richiesta" | "prompt" | "didascalia", etichetta: string, righe: number, aiuto?: string) => (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); salva() }}>
      <Label htmlFor={`${id}-${campo}`}>{etichetta}</Label>
      {campo === "didascalia"
        ? <Input id={`${id}-${campo}`} autoFocus value={valore} maxLength={400} onChange={(e) => setValore(e.target.value)} />
        : <Textarea id={`${id}-${campo}`} autoFocus rows={righe} value={valore} onChange={(e) => setValore(e.target.value)} className={campo === "prompt" ? "font-mono text-xs leading-relaxed" : undefined} />}
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
            {g.errore.operazione === "immagine" && g.prompt && <BottoneCopia testo={g.prompt} etichetta="Copia il prompt per ChatGPT" />}
          </>}>
          {g.errore.messaggio}
        </Nota>
      )}

      {/* Prompt */}
      <div className="mt-3 border-t pt-3">
        {g.operazione?.tipo === "prompt" ? (
          <div aria-live="polite">
            <p className="text-xs text-foreground-2">Claude sta leggendo proposta, gap collegati ed elaborati per scrivere il prompt. Di solito servono 1 o 2 minuti, puoi continuare a lavorare.</p>
            <Skeleton className="mt-2 h-16" />
          </div>
        ) : modifica === "prompt" ? editor("prompt", "Prompt per il modello d'immagine", 10, "In inglese, i modelli d'immagine lo seguono meglio. Le etichette da scrivere nell'immagine vanno tra virgolette, in italiano.") : g.prompt ? (
          <>
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold">Prompt <span className="font-normal text-muted-foreground">{g.prompt_preparato_il ? `preparato ${quandoBreve(g.prompt_preparato_il)}` : "scritto a mano"}</span></summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-3 font-mono text-micro leading-relaxed text-foreground-2">{g.prompt}</pre>
            </details>
            {g.note_prompt && <p className="mt-1.5 max-w-[65ch] text-micro text-muted-foreground">{g.note_prompt}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <BottoneCopia testo={g.prompt} variant={openai ? "outline" : "default"} />
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

      {/* Immagine */}
      <div className="mt-3 border-t pt-3">
        {g.operazione?.tipo === "immagine" ? (
          <div aria-live="polite">
            <Skeleton className="aspect-[3/2] w-full max-w-md" />
            <p className="mt-2 text-xs text-foreground-2">OpenAI sta generando l'immagine: di solito meno di un minuto.</p>
          </div>
        ) : g.immagine ? (
          <figure className="max-w-md">
            <a href={Api.urlImmagineGrafica(slug, d.id, g.id, g.immagine.caricata_il)} target="_blank" rel="noopener">
              <img src={Api.urlImmagineGrafica(slug, d.id, g.id, g.immagine.caricata_il)} alt={g.didascalia || g.richiesta} className="aspect-[3/2] w-full rounded-md border bg-card object-contain" />
            </a>
            <figcaption className="mt-1 text-micro text-muted-foreground">{g.immagine.origine === "openai" ? `Generata con ${g.immagine.modello || "OpenAI"}` : "Caricata"} {quandoBreve(g.immagine.caricata_il)}</figcaption>
          </figure>
        ) : (
          <div className="flex aspect-[3/2] w-full max-w-md flex-col items-center justify-center gap-1 rounded-md border border-dashed text-center">
            <ImageIcon size={20} className="text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-foreground-2">Nessuna immagine</span>
            <span className="max-w-[36ch] text-micro text-muted-foreground">{!g.prompt ? "Prima prepara il prompt." : openai ? "Generala da qui o carica la tua." : "Copia il prompt in ChatGPT e carica qui il PNG."}</span>
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
