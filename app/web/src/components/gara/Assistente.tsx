// Assistente di gara: pannello flottante in sola lettura, contesto l'intera
// gara, attivo dalla Fase 2 completata (stesso vincolo del backend). Tre
// dimensioni preimpostate, S, M, L, ricordate fra le sessioni; le risposte
// in markdown.

import { useEffect, useRef, useState } from "react"
import { ChatCircleTextIcon, LockSimpleIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Composer, Messaggi, type Messaggio } from "@/components/comuni/Chat"
import { BadgeStato } from "@/components/gare/BadgeStato"
import { useGara } from "./GaraContext"
import { useChiediAssistente, useCronologiaAssistente, useCriteri, useDocumenti } from "@/hooks/useGaraDati"
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
  const cronologia = useCronologiaAssistente(slug, pronto)
  const chiedi = useChiediAssistente(slug)
  const documenti = useDocumenti(slug, aperto)
  const criteri = useCriteri(slug, aperto)
  const fab = useRef<HTMLButtonElement>(null)

  useEffect(() => { try { localStorage.setItem(CHIAVE_DIM, dimensione) } catch { /* solo per questa sessione */ } }, [dimensione])

  const messaggi: Messaggio[] = (cronologia.data || []).map((m) => ({ mio: m.ruolo === "utente", testo: m.testo }))
  if (inviato) messaggi.push({ mio: true, testo: inviato })

  const invia = (q: string) => {
    setErrore(null)
    setInviato(q)
    chiedi.mutate(q, {
      onSuccess: () => setInviato(null),
      onError: (e) => {
        setInviato(null)
        const err = comeApiError(e)
        // 409 = vincolo di dominio: è un'informazione, non un guasto.
        setErrore(err.stato === 409 ? err.message : `Assistente non disponibile (${err.stato || "nessuna risposta"}). La gara non è stata modificata.`)
      },
    })
  }
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
            messaggi={messaggi} chi="Assistente" pensa={chiedi.isPending} errore={errore}
            vuoto="Nessuna domanda ancora. L'assistente legge documenti ed elaborati già prodotti da questa gara."
          />
          <div className="border-t px-4 py-3">
            <Composer onInvia={invia} disabilitato={chiedi.isPending} placeholder="Chiedi qualcosa sulla gara" etichetta="Domanda per l'assistente" suggerimenti={messaggi.length ? undefined : SUGGERIMENTI} />
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
