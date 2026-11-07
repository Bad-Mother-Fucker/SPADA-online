// Schede tecniche della relazione tecnica (Fase 7). Come per le figure,
// SPADA propone e il professionista sceglie: Claude elenca, per le proposte
// approvate, i prodotti che potrebbero dover presentare un documento del
// produttore (scheda tecnica, EPD, DoP, certificato, rapporto di prova); il
// professionista include solo quelli da allegare. SOLO le incluse entrano
// nella relazione («Allegato T.n»). Il PDF si carica o si cerca online sul
// sito del produttore; l'esportazione le consegna come scelto.

import { useId, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon, CheckIcon, DownloadSimpleIcon, FilePdfIcon, GlobeIcon, PlusIcon, SparkleIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { BottoneScelta, Card, Nota, Scheletro, Suggerimento, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { DialogoConferma, type Conferma } from "../DialogoConferma"
import { useGara } from "../GaraContext"
import { useAzioniSchede, useSchede, type Deliverable } from "@/hooks/useGaraDati"
import { Api, type ConsegnaSchede, type ElencoSchede, type PropostaPerGrafica, type Scheda, type TipoScheda } from "@/lib/api"
import { plurale, quandoBreve } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import type { Tono } from "@/dominio/fasi"

const ETICHETTA_CONSEGNA: Record<ConsegnaSchede, string> = {
  in_coda: "In coda alla relazione, nello stesso documento",
  file: "File PDF separati, numerati",
  zip: "Un unico archivio ZIP",
}

function statoScheda(x: Scheda): { tono: Tono; etichetta: string; pulsa?: boolean } {
  if (x.operazione) return { tono: "run", etichetta: "Ricerca online in corso", pulsa: true }
  if (!x.proposta_approvata) return { tono: "neu", etichetta: "Esclusa dal documento" }
  if (!x.inclusa) return { tono: "neu", etichetta: "Non allegata" }
  if (x.errore) return { tono: "crit", etichetta: "Ricerca non riuscita" }
  if (x.file?.avvisi.length) return { tono: "attn", etichetta: "PDF da controllare" }
  if (x.file) return { tono: "ok", etichetta: "PDF pronto" }
  if (x.candidati.length) return { tono: "attn", etichetta: "Scegli il prodotto" }
  return { tono: "attn", etichetta: "Manca il PDF" }
}

/** Il pannello delle schede tecniche, sotto le figure della relazione tecnica. */
export function PannelloSchede({ d }: { d: Deliverable }) {
  const { slug } = useGara()
  const q = useSchede(slug, d.id)
  const r = risorsa(q, { percorso: `/gare/${slug}/deliverables/${d.id}/schede` })

  if (r.stato === "caricamento") return <Scheletro righe={4} />
  if (r.stato === "assente" || (r.stato === "vuoto" && !r.dati)) return <Nota tono="neu" titolo="Schede tecniche non disponibili">Il backend in esecuzione è più vecchio dell'interfaccia: riavvia SPADA per usare le schede tecniche della relazione.</Nota>
  if (r.stato === "errore" || !r.dati) return <StatoErrore titolo="Schede tecniche non leggibili" errore={r.errore!} percorso={`deliverables/${d.id}/schede`} onRiprova={r.riprova} inCorso={q.isFetching} />
  return <ContenutoSchede d={d} dati={r.dati} />
}

function ContenutoSchede({ d, dati }: { d: Deliverable; dati: ElencoSchede }) {
  const { slug } = useGara()
  const az = useAzioniSchede(slug, d.id)
  const { proposte, schede, testi } = dati
  const attive = schede.filter((x) => x.proposta_approvata)
  const escluse = schede.filter((x) => !x.proposta_approvata)
  const incluse = attive.filter((x) => x.inclusa)
  const conPdf = incluse.filter((x) => x.file).length
  const nonCitate = (stadio: string) => (testi[stadio] ? incluse.filter((x) => x.citata[stadio] === false).length : 0)
  const citateEscluse = (stadio: string) => (testi[stadio] ? attive.filter((x) => !x.inclusa && x.citata[stadio]).length : 0)
  const fuoriDefinitivo = nonCitate("definitivo") + citateEscluse("definitivo")
  const fuoriBozza = nonCitate("bozza") + citateEscluse("bozza")
  const perCriterio = proposte.reduce<Record<string, PropostaPerGrafica[]>>((acc, p) => ((acc[p.criterio] ||= []).push(p), acc), {})
  const proponi = () => az.proponi.mutate(undefined, { onError: (e) => toast.error("Proposta non avviata", { description: comeApiError(e).message }) })

  return (
    <Card aria-labelledby="h-schede">
      <TitoloSezione azioni={dati.operazione ? undefined : (
        <Button size="sm" variant={schede.length ? "outline" : "default"} disabled={!proposte.length || az.proponi.isPending} onClick={proponi}>
          <SparkleIcon aria-hidden="true" />{schede.length ? "Proponi di nuovo" : "Proponi le schede"}
        </Button>
      )}>
        <span id="h-schede">Schede tecniche allegate</span>
        {incluse.length > 0 && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{plurale(incluse.length, "allegata", "allegate")}, {conPdf} con PDF</span>}
      </TitoloSezione>
      <p className="mb-3 max-w-[65ch] text-xs text-foreground-2">
        SPADA elenca i prodotti delle proposte approvate che potrebbero avere una scheda tecnica, un'EPD, una dichiarazione di prestazione, un certificato o un rapporto di prova.
        Includi solo quelli da allegare: la relazione cita soltanto le schede incluse, come «Allegato T.1», «Allegato T.2»…, fuori dal limite di facciate.
        Conviene sceglierle prima della bozza.
      </p>

      {dati.operazione && (
        <div aria-live="polite" className="mb-3 rounded-md border p-3">
          <p className="text-xs text-foreground-2">Claude sta leggendo le proposte approvate per elencare i documenti di prodotto. Di solito servono 2 o 3 minuti, puoi continuare a lavorare.</p>
          <Skeleton className="mt-2 h-10" />
        </div>
      )}
      {dati.errore && !dati.operazione && (
        <Nota tono="crit" role="alert" className="mb-3" titolo="Elenco non preparato"
          azioni={<Button size="sm" variant="outline" onClick={proponi}><ArrowCounterClockwiseIcon aria-hidden="true" />Riprova</Button>}>
          {dati.errore.messaggio}
        </Nota>
      )}
      {fuoriDefinitivo > 0 ? (
        <Nota tono="attn" className="mb-3" titolo="Il definitivo non rispecchia le schede scelte">
          {plurale(nonCitate("definitivo"), "scheda inclusa non è citata", "schede incluse non sono citate")}{citateEscluse("definitivo") ? `, ${plurale(citateEscluse("definitivo"), "esclusa è ancora citata", "escluse sono ancora citate")}` : ""}.
          {" "}All'esportazione le incluse finiscono comunque fra gli allegati e i rimandi alle escluse spariscono, ma il testo non le presenta: rifai il definitivo.
        </Nota>
      ) : fuoriBozza > 0 && (
        <Nota tono="attn" className="mb-3" titolo="La bozza non rispecchia le schede scelte">
          Le schede sono cambiate dopo la scrittura della bozza: rifai la bozza per citarle nel testo.
        </Nota>
      )}

      <Consegna d={d} dati={dati} />

      {!proposte.length ? (
        <VuotoInline titolo="Nessuna proposta approvata" testo="Le schede si propongono per le proposte approvate nella Fase 6. Al momento non ce n'è nessuna." />
      ) : !schede.length && !dati.operazione ? (
        <VuotoInline titolo="Nessuna scheda in elenco" testo="Con «Proponi le schede» Claude elenca i documenti di prodotto possibili per ogni proposta. Puoi anche aggiungerne a mano sotto la proposta." />
      ) : null}
      {proposte.length > 0 && (
        <div className="mt-4 space-y-5">
          {Object.entries(perCriterio).map(([criterio, lista]) => (
            <section key={criterio} aria-label={`Criterio ${criterio}`} className="space-y-3">
              <h4 className="text-xs font-semibold text-foreground-2">Criterio {criterio.replace(/^C/, "")}</h4>
              {lista.map((p) => <RigaProposta key={p.id} d={d} p={p} schede={attive.filter((x) => x.proposta_id === p.id)} tipi={dati.tipi} />)}
            </section>
          ))}
          {escluse.length > 0 && (
            <section aria-label="Schede di proposte non più approvate" className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold text-foreground-2">Proposte non più approvate</h4>
              <p className="text-micro text-muted-foreground">Queste schede restano qui ma non entrano nel documento. Se la proposta torna approvata, ricompaiono al loro posto.</p>
              {escluse.map((x) => <CardScheda key={x.id} d={d} x={x} tipi={dati.tipi} />)}
            </section>
          )}
        </div>
      )}
    </Card>
  )
}

function Consegna({ d, dati }: { d: Deliverable; dati: ElencoSchede }) {
  const { slug } = useGara()
  const az = useAzioniSchede(slug, d.id)
  const id = useId()
  const cambia = (v: string) => az.consegna.mutate(v as ConsegnaSchede, { onError: (e) => toast.error("Scelta non salvata", { description: comeApiError(e).message }) })
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-xs font-semibold">Come si consegnano</legend>
      <RadioGroup value={dati.consegna} onValueChange={cambia} className="mt-1 gap-1.5" aria-describedby={`${id}-aiuto`}>
        {(Object.keys(ETICHETTA_CONSEGNA) as ConsegnaSchede[]).map((c) => (
          <div key={c} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${c}`} value={c} />
            <Label htmlFor={`${id}-${c}`} className="text-sm font-normal">{ETICHETTA_CONSEGNA[c]}{c === "in_coda" && <span className="ml-1 text-muted-foreground">(predefinito)</span>}</Label>
          </div>
        ))}
      </RadioGroup>
      <Suggerimento id={`${id}-aiuto`}>
        In tutti i casi la relazione si chiude con l'elenco degli allegati. In coda: frontespizio e pagine di ogni scheda dopo la relazione (nel PDF i PDF originali). File o ZIP: si producono all'esportazione della relazione.
      </Suggerimento>
      {dati.consegnati.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dati.consegnati.slice(0, 12).map((p) => (
            <Button key={p} size="sm" variant="outline" asChild>
              <a href={Api.percorsoOutput(slug, p)} target="_blank" rel="noopener"><DownloadSimpleIcon aria-hidden="true" />{p.split("/").pop()}</a>
            </Button>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function RigaProposta({ d, p, schede, tipi }: { d: Deliverable; p: PropostaPerGrafica; schede: Scheda[]; tipi: Record<TipoScheda, string> }) {
  const [nuova, setNuova] = useState(false)
  const incluse = schede.filter((x) => x.inclusa).length
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{p.titolo}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            <Chip mono>{p.sottocriterio}</Chip>
            {schede.length > 0 && <Chip>{plurale(schede.length, "proposta", "proposte")} di SPADA o tue, {incluse} {incluse === 1 ? "inclusa" : "incluse"}</Chip>}
          </div>
        </div>
        {!nuova && <Button size="sm" variant="outline" onClick={() => setNuova(true)}><PlusIcon aria-hidden="true" />Aggiungi scheda</Button>}
      </div>
      {(schede.length > 0 || nuova) && (
        <div className="mt-3 space-y-2">
          {schede.map((x) => <CardScheda key={x.id} d={d} x={x} tipi={tipi} />)}
          {nuova && <NuovaScheda d={d} p={p} tipi={tipi} onChiudi={() => setNuova(false)} />}
        </div>
      )}
    </div>
  )
}

function NuovaScheda({ d, p, tipi, onChiudi }: { d: Deliverable; p: PropostaPerGrafica; tipi: Record<TipoScheda, string>; onChiudi: () => void }) {
  const { slug } = useGara()
  const az = useAzioniSchede(slug, d.id)
  const id = useId()
  const [oggetto, setOggetto] = useState("")
  const [tipo, setTipo] = useState<TipoScheda>("scheda_tecnica")
  const [documenta, setDocumenta] = useState("")
  const valido = oggetto.trim().length >= 3
  const invia = () => az.crea.mutate({ proposta_id: p.id, oggetto: oggetto.trim(), tipo, documenta: documenta.trim() || undefined }, {
    onSuccess: onChiudi,
    onError: (e) => toast.error("Scheda non aggiunta", { description: comeApiError(e).message }),
  })
  return (
    <form className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_220px]" onSubmit={(e) => { e.preventDefault(); if (valido) invia() }}>
      <div className="space-y-1">
        <Label htmlFor={`${id}-oggetto`}>Prodotto o componente</Label>
        <Input id={`${id}-oggetto`} autoFocus value={oggetto} maxLength={300} onChange={(e) => setOggetto(e.target.value)} placeholder="es. isolante delle tubazioni idrauliche" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-tipo`}>Documento</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoScheda)}>
          <SelectTrigger id={`${id}-tipo`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(tipi) as TipoScheda[]).map((t) => <SelectItem key={t} value={t}>{tipi[t]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${id}-documenta`}>Cosa deve comprovare <span className="font-normal text-muted-foreground">(facoltativo, aiuta la ricerca online)</span></Label>
        <Input id={`${id}-documenta`} value={documenta} maxLength={1000} onChange={(e) => setDocumenta(e.target.value)} placeholder="es. conducibilità a 40 °C e classe di reazione al fuoco" />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!valido || az.crea.isPending}>{az.crea.isPending ? "Aggiungo" : "Aggiungi e includi"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onChiudi}>Annulla</Button>
      </div>
    </form>
  )
}

function CardScheda({ d, x, tipi }: { d: Deliverable; x: Scheda; tipi: Record<TipoScheda, string> }) {
  const { slug } = useGara()
  const az = useAzioniSchede(slug, d.id)
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [prodotto, setProdotto] = useState({ produttore: x.produttore, modello: x.modello })
  const [progresso, setProgresso] = useState<number | null>(null)
  const [scaricando, setScaricando] = useState<number | null>(null)
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const st = statoScheda(x)
  const occupata = !!x.operazione
  const ko = (t: string) => (e: unknown) => toast.error(t, { description: comeApiError(e).message })
  const modificato = prodotto.produttore.trim() !== x.produttore || prodotto.modello.trim() !== x.modello

  const includi = (v: boolean) => az.aggiorna.mutate({ sid: x.id, inclusa: v }, { onError: ko("Scelta non salvata") })
  const salvaProdotto = () => az.aggiorna.mutate({ sid: x.id, produttore: prodotto.produttore.trim(), modello: prodotto.modello.trim() }, { onError: ko("Prodotto non salvato") })
  const cerca = () => {
    const fai = () => az.cerca.mutate(x.id, { onError: ko("Ricerca non avviata") })
    if (modificato) az.aggiorna.mutate({ sid: x.id, produttore: prodotto.produttore.trim(), modello: prodotto.modello.trim() }, { onSuccess: fai, onError: ko("Prodotto non salvato") })
    else fai()
  }
  const usa = (indice: number) => {
    const fai = () => {
      setScaricando(indice)
      az.usa.mutate({ sid: x.id, indice }, { onSuccess: () => toast.success("Scheda scaricata dal sito del produttore."), onError: ko("PDF non scaricato"), onSettled: () => setScaricando(null) })
    }
    if (x.file) setConferma({ titolo: "Sostituire il PDF?", etichetta: "Sostituisci", descrizione: "Il PDF attuale viene archiviato, non cancellato.", onConferma: fai })
    else fai()
  }
  const carica = (file: File) => {
    if (file.type && file.type !== "application/pdf") {
      toast.error("PDF non caricato", { description: `«${file.name}» non è un PDF.` })
      return
    }
    setProgresso(0)
    az.carica.mutate({ sid: x.id, file, suProgresso: setProgresso }, { onSuccess: () => toast.success("PDF caricato."), onError: ko("PDF non caricato"), onSettled: () => setProgresso(null) })
  }
  const elimina = () => setConferma({
    titolo: "Togliere la scheda dall'elenco?", etichetta: "Togli", distruttiva: true,
    descrizione: `«${x.oggetto}» esce dall'elenco e dalle prossime stesure.${x.file ? " Il PDF viene archiviato, non cancellato." : ""} Se il testo la cita già, rifai la bozza o il definitivo.`,
    onConferma: () => az.elimina.mutate(x.id, { onError: ko("Scheda non tolta") }),
  })

  return (
    <article className="rounded-md border bg-background p-3" aria-labelledby={`${id}-titolo`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h5 id={`${id}-titolo`} className="text-sm font-medium">{x.oggetto}</h5>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip>{tipi[x.tipo] || x.tipo}</Chip>
            <BadgeStato tono={st.tono} pulsa={st.pulsa}>{st.etichetta}</BadgeStato>
            {x.origine === "professionista" && <Chip>aggiunta da te</Chip>}
          </div>
          {x.documenta && <p className="mt-1.5 max-w-[65ch] text-xs text-foreground-2">{x.documenta}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {x.proposta_approvata && (
            <BottoneScelta tono="ok" attivo={x.inclusa} disabled={occupata} onClick={() => includi(!x.inclusa)} aria-label={x.inclusa ? `Escludi ${x.oggetto}` : `Includi ${x.oggetto}`}>
              {x.inclusa && <CheckIcon aria-hidden="true" />}{x.inclusa ? "Inclusa" : "Includi"}
            </BottoneScelta>
          )}
          <Button size="sm" variant="ghost" disabled={occupata || az.elimina.isPending} onClick={elimina} aria-label={`Togli ${x.oggetto}`}><TrashIcon aria-hidden="true" /></Button>
        </div>
      </div>

      {x.inclusa && x.proposta_approvata && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {/* Prodotto: guida la ricerca online e compare nel titolo dell'allegato */}
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); salvaProdotto() }}>
            <div className="space-y-1">
              <Label htmlFor={`${id}-produttore`} className="text-xs">Produttore</Label>
              <Input id={`${id}-produttore`} value={prodotto.produttore} maxLength={200} disabled={occupata} onChange={(e) => setProdotto({ ...prodotto, produttore: e.target.value })} placeholder="se lo hai già scelto" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-modello`} className="text-xs">Modello</Label>
              <Input id={`${id}-modello`} value={prodotto.modello} maxLength={200} disabled={occupata} onChange={(e) => setProdotto({ ...prodotto, modello: e.target.value })} />
            </div>
            <div className="flex items-end">{modificato && <Button type="submit" size="sm" variant="outline" disabled={az.aggiorna.isPending}>Salva</Button>}</div>
          </form>

          {/* PDF */}
          {x.file ? (
            <div className="rounded-md border p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <FilePdfIcon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{x.file.fonte?.tipo === "online" ? "Scaricata dal sito del produttore" : `Caricata da te${x.file.fonte?.nome_originale ? ` («${x.file.fonte.nome_originale}»)` : ""}`}{x.file.pagine ? `, ${plurale(x.file.pagine, "pagina", "pagine")}` : ""}, {quandoBreve(x.file.caricato_il)}</span>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" asChild><a href={Api.urlFileScheda(slug, d.id, x.id, x.file.caricato_il)} target="_blank" rel="noopener"><FilePdfIcon aria-hidden="true" />Apri</a></Button>
                  {x.file.fonte?.pagina && <Button size="sm" variant="ghost" asChild><a href={x.file.fonte.pagina} target="_blank" rel="noopener noreferrer"><ArrowSquareOutIcon aria-hidden="true" />Pagina del produttore</a></Button>}
                </div>
              </div>
              {x.file.avvisi.map((a, i) => <Suggerimento key={i} tono="attn">{a}</Suggerimento>)}
            </div>
          ) : null}

          {x.errore && !occupata && (
            <Nota tono="crit" role="alert" titolo="Ricerca non riuscita" azioni={<Button size="sm" variant="outline" onClick={cerca}><ArrowCounterClockwiseIcon aria-hidden="true" />Riprova</Button>}>
              {x.errore.messaggio}
            </Nota>
          )}

          {occupata ? (
            <div aria-live="polite">
              <p className="text-xs text-foreground-2">
                {x.produttore || x.modello ? `Claude cerca il documento di ${[x.produttore, x.modello].filter(Boolean).join(" ")} sul sito del produttore.` : "Claude cerca due o tre prodotti conformi alla proposta e i loro documenti sui siti dei produttori."}
                {" "}Di solito servono 2 o 4 minuti, puoi continuare a lavorare.
              </p>
              <Skeleton className="mt-2 h-12" />
            </div>
          ) : x.candidati.length > 0 && (
            <div className="space-y-2">
              <h6 className="text-xs font-semibold">Trovati online {x.note_ricerca && <span className="font-normal text-muted-foreground">— {x.note_ricerca}</span>}</h6>
              {x.candidati.map((c, i) => (
                <div key={i} className="rounded-md border p-2.5 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{[c.produttore, c.modello].filter(Boolean).join(" — ") || "Prodotto senza nome"}</div>
                      {c.verifica && <p className="mt-0.5 max-w-[65ch] text-foreground-2">{c.verifica}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.url_pdf ? (
                        <Button size="sm" variant="outline" disabled={scaricando !== null || progresso !== null} onClick={() => usa(i)}>
                          <DownloadSimpleIcon aria-hidden="true" />{scaricando === i ? "Scarico" : "Usa questa"}
                        </Button>
                      ) : <span className="self-center text-micro text-muted-foreground">PDF non scaricabile direttamente</span>}
                      {(c.url_pagina || c.url_pdf) && <Button size="sm" variant="ghost" asChild><a href={c.url_pagina || c.url_pdf} target="_blank" rel="noopener noreferrer"><ArrowSquareOutIcon aria-hidden="true" />Apri il sito</a></Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!occupata && !x.candidati.length && x.note_ricerca && <p className="text-micro text-muted-foreground">{x.note_ricerca}</p>}

          {!occupata && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={x.file ? "ghost" : "outline"} disabled={progresso !== null} onClick={() => fileRef.current?.click()}>
                <UploadSimpleIcon aria-hidden="true" />{progresso !== null ? `Caricamento ${Math.round(progresso * 100)}%` : x.file ? "Sostituisci con un PDF tuo" : "Carica il PDF"}
              </Button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={`PDF per ${x.oggetto}`}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) carica(f) }} />
              <Button size="sm" variant={x.file ? "ghost" : "outline"} disabled={az.cerca.isPending} onClick={cerca}>
                <GlobeIcon aria-hidden="true" />{x.candidati.length || x.note_ricerca ? "Cerca di nuovo online" : "Cerca online"}
              </Button>
              <Suggerimento>{prodotto.produttore.trim() || prodotto.modello.trim() ? "La ricerca cerca questo prodotto sul sito del suo produttore." : "Senza produttore, la ricerca propone due o tre prodotti conformi: scegli tu quale usare."}</Suggerimento>
            </div>
          )}
        </div>
      )}
      <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />
    </article>
  )
}
