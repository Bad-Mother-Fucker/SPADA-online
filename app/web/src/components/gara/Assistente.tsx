// Assistente di gara: pannello flottante in sola lettura, contesto l'intera
// gara, attivo dalla Fase 2 completata (stesso vincolo del backend). Tre
// dimensioni preimpostate, S, M, L, ricordate fra le sessioni; le risposte
// in markdown, mostrate mentre vengono scritte. Due modalità: risposta
// rapida e ricerca approfondita; durante la ricerca la nuvoletta dice cosa
// l'assistente sta consultando (strumenti davvero usati, dal backend).

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ChatCircleTextIcon, LockSimpleIcon, StopIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Composer, Messaggi, type InScrittura, type Messaggio } from "@/components/comuni/Chat"
import { BadgeStato } from "@/components/gare/BadgeStato"
import { useGara } from "./GaraContext"
import { chiaviGara, useCronologiaAssistente, useCriteri, useDocumenti, type MessaggioChat } from "@/hooks/useGaraDati"
import { Api, type ModalitaAssistente } from "@/lib/api"
import { comeApiError } from "@/lib/risorsa"
import { plurale } from "@/lib/formato"
import { cn } from "@/lib/utils"
import { statoFase } from "@/dominio/fasi"

const SUGGERIMENTI = ["Quali penali sono previste?", "Cosa pesa di più nel punteggio tecnico?", "Quali requisiti restano scoperti?"]

type Dimensione = "piccola" | "media" | "grande"
const CHIAVE_DIM = "spada.assistente.dimensione"
const DIMENSIONI: { id: Dimensione; etichetta: string; titolo: string; classe: string }[] = [
  { id: "piccola", etichetta: "S", titolo: "Piccola: pannello compatto", classe: "w-[392px] max-h-[min(620px,calc(100vh-150px))]" },
  { id: "media", etichetta: "M", titolo: "Media: più spazio per le risposte", classe: "w-[640px] max-h-[min(840px,calc(100vh-150px))]" },
  { id: "grande", etichetta: "L", titolo: "Grande: quasi tutta la finestra", classe: "w-[980px] max-h-[calc(100vh-150px)]" },
]
const CHIAVE_MODALITA = "spada.assistente.modalita"
const MODALITA: { id: ModalitaAssistente; etichetta: string; aiuto: string }[] = [
  { id: "rapida", etichetta: "Risposta rapida", aiuto: "Una o due frasi, in pochi secondi: per domande semplici come la scadenza o l'importo." },
  { id: "approfondita", etichetta: "Ricerca approfondita", aiuto: "Cerca e verifica nei documenti, poi risponde citando le fonti. Mentre lavora vedi cosa sta consultando." },
]
const leggiModalita = (): ModalitaAssistente => {
  try { return localStorage.getItem(CHIAVE_MODALITA) === "approfondita" ? "approfondita" : "rapida" } catch { return "rapida" }
}
const leggiDimensione = (): Dimensione => {
  try { const v = localStorage.getItem(CHIAVE_DIM); return v === "media" || v === "grande" ? v : "piccola" } catch { return "piccola" }
}

export function Assistente() {
  const { slug, gara } = useGara()
  const pronto = statoFase(gara.fasi, 2) === "completata"
  const [aperto, setAperto] = useState(false)
  const [dimensione, setDimensione] = useState<Dimensione>(leggiDimensione)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviato, setInviato] = useState<string | null>(null)
  const [modalita, setModalita] = useState<ModalitaAssistente>(leggiModalita)
  const [inScrittura, setInScrittura] = useState<InScrittura & { completa?: boolean } | null>(null)
  const controllo = useRef<AbortController | null>(null)
  const qc = useQueryClient()
  const cronologia = useCronologiaAssistente(slug, pronto)
  const inCorso = inScrittura !== null
  const documenti = useDocumenti(slug, aperto)
  const criteri = useCriteri(slug, aperto)
  const fab = useRef<HTMLButtonElement>(null)

  useEffect(() => { try { localStorage.setItem(CHIAVE_DIM, dimensione) } catch { /* solo per questa sessione */ } }, [dimensione])
  useEffect(() => { try { localStorage.setItem(CHIAVE_MODALITA, modalita) } catch { /* solo per questa sessione */ } }, [modalita])
  // Uscendo dalla gara non resta una risposta appesa.
  useEffect(() => () => controllo.current?.abort(), [])

  const messaggi: Messaggio[] = (cronologia.data || []).map((m) => ({ mio: m.ruolo === "utente", testo: m.testo }))
  if (inviato) messaggi.push({ mio: true, testo: inviato })

  /** La risposta passa dalla nuvoletta alla cronologia nello stesso
      render, senza doppioni né scatti; poi si rilegge quella del server. */
  const chiudiScrittura = (domanda: string, risposta: string | null) => {
    if (risposta !== null) {
      qc.setQueryData<MessaggioChat[]>(chiaviGara.assistente(slug), (prima) => [...(prima || []), { ruolo: "utente", testo: domanda }, { ruolo: "assistente", testo: risposta }])
    }
    setInviato(null)
    setInScrittura(null)
    void qc.invalidateQueries({ queryKey: chiaviGara.assistente(slug) })
  }

  const invia = async (q: string) => {
    setErrore(null)
    setInviato(q)
    setInScrittura({ testo: "", stato: null, messaggio: 0 })
    const c = new AbortController()
    controllo.current = c
    let finale: string | null = null
    try {
      await Api.streamAssistente(slug, q, modalita, (e) => {
        if (e.tipo === "stato") setInScrittura((s) => s && { ...s, stato: e.testo })
        else if (e.tipo === "nuovo") setInScrittura((s) => s && { testo: "", stato: s.stato, messaggio: (s.messaggio ?? 0) + 1 })
        else if (e.tipo === "testo") setInScrittura((s) => s && { ...s, testo: s.testo + e.delta, stato: null })
        else if (e.tipo === "fine") finale = e.risposta
        else if (e.tipo === "errore") setErrore(`L'assistente non ha completato la risposta: ${e.messaggio}`)
      }, c.signal)
    } catch (e) {
      if (!c.signal.aborted) {
        const err = comeApiError(e)
        // 409 = vincolo di dominio: è un'informazione, non un guasto.
        setErrore(err.stato === 409 ? err.message : `Assistente non disponibile (${err.stato || "nessuna risposta"}). La gara non è stata modificata.`)
      }
    } finally {
      controllo.current = null
    }
    const risposta: string | null = finale
    if (risposta === null) { chiudiScrittura(q, null); return }
    // La rivelazione progressiva finisce sul testo definitivo, poi passa in cronologia.
    setInScrittura((s) => s && { ...s, testo: risposta, stato: null, completa: true })
  }
  const interrompi = () => { controllo.current?.abort() }
  const chiudi = () => { setAperto(false); fab.current?.focus() }
  const ambito = [
    documenti.isSuccess ? plurale(documenti.data.length, "documento", "documenti") : null,
    criteri.isSuccess && criteri.data ? plurale(criteri.data.length, "requisito", "requisiti") : null,
  ].filter(Boolean).join(", ") || "elaborati della gara"
  const dim = DIMENSIONI.find((d) => d.id === dimensione) || DIMENSIONI[0]

  return (
    <>
      {aperto && pronto && (
        <aside
          id="assistente" aria-label="Assistente di gara" onKeyDown={(e) => { if (e.key === "Escape") chiudi() }}
          className={cn("fixed bottom-[86px] right-6 z-30 flex max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-xl border border-border-strong bg-card shadow-sheet",
            "animate-in fade-in slide-in-from-bottom-2 [animation-duration:var(--d-enter)] [animation-timing-function:var(--e-enter)]", dim.classe)}
        >
          <header className="border-b px-4 py-3">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Assistente di gara</h2>
              <BadgeStato tono="run">sola lettura</BadgeStato>
              <span className="flex-1" />
              <div role="group" aria-label="Dimensione del pannello" className="inline-flex overflow-hidden rounded-md border border-border-strong">
                {DIMENSIONI.map((d) => (
                  <button key={d.id} type="button" title={d.titolo} aria-pressed={dimensione === d.id} onClick={() => setDimensione(d.id)}
                    className={cn("min-w-7 px-2 py-0.5 font-mono text-micro transition-colors duration-(--d-fast)", dimensione === d.id ? "bg-foreground text-background" : "text-foreground-2 hover:bg-muted")}>
                    {d.etichetta}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon-xs" aria-label="Chiudi assistente" onClick={chiudi}><XIcon aria-hidden="true" /></Button>
            </div>
            <p className="text-micro text-muted-foreground">Risponde solo su documenti ed elaborati di questa gara. Non modifica nulla: per intervenire si usano le azioni di fase e la vista Attività.</p>
          </header>
          <div className="border-b bg-muted px-4 py-1.5 text-micro text-muted-foreground">Contesto: <b className="font-medium text-foreground-2">intera gara</b>, {ambito}</div>
          <Messaggi
            className={cn("min-h-[200px] flex-1 overflow-y-auto px-4 py-3", dimensione === "grande" && "text-base")}
            messaggi={messaggi} chi="Assistente" inScrittura={inScrittura}
            onMostrata={() => { if (inScrittura?.completa && inviato) chiudiScrittura(inviato, inScrittura.testo) }} errore={errore}
            vuoto="Nessuna domanda ancora. L'assistente legge documenti ed elaborati già prodotti da questa gara."
          />
          <div className="space-y-2 border-t px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Modalità dell'assistente" className="inline-flex overflow-hidden rounded-md border border-border-strong">
                {MODALITA.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={modalita === m.id} title={m.aiuto} disabled={inCorso} onClick={() => setModalita(m.id)}
                    className={cn("px-2.5 py-1 text-micro font-medium transition-colors duration-(--d-fast) disabled:opacity-60", modalita === m.id ? "bg-foreground text-background" : "text-foreground-2 hover:bg-muted")}>
                    {m.etichetta}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              {inCorso && <Button size="sm" variant="outline" onClick={interrompi}><StopIcon aria-hidden="true" />Interrompi</Button>}
            </div>
            <p className="text-micro text-muted-foreground">{MODALITA.find((m) => m.id === modalita)?.aiuto}</p>
            <Composer onInvia={(q) => void invia(q)} disabilitato={inCorso} placeholder="Chiedi qualcosa sulla gara" etichetta="Domanda per l'assistente" suggerimenti={messaggi.length ? undefined : SUGGERIMENTI} />
          </div>
        </aside>
      )}
      <button
        ref={fab} type="button" disabled={!pronto} aria-expanded={aperto && pronto} aria-controls="assistente"
        onClick={() => setAperto((v) => !v)}
        title={pronto ? undefined : "L'assistente si attiva quando la Fase 2 ha costruito il grafo di conoscenza."}
        className={cn("fixed bottom-6 right-6 z-40 inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium shadow-pop transition-colors duration-(--d-fast)",
          !pronto ? "cursor-not-allowed border-border bg-card text-muted-foreground" : aperto ? "border-border-strong bg-card hover:bg-muted" : "border-transparent bg-primary text-primary-foreground hover:bg-primary/90")}
      >
        {pronto ? <ChatCircleTextIcon size={16} aria-hidden="true" /> : <LockSimpleIcon size={16} aria-hidden="true" />}
        {pronto ? (aperto ? "Chiudi assistente" : "Assistente di gara") : "Assistente, dalla Fase 2"}
      </button>
    </>
  )
}
