// Il guscio della pagina gara: un solo contenitore persistente, non si
// ricarica mai; cambia solo l'area centrale. Lo stream SSE è aperto qui,
// non dalle viste: cambiare fase non riapre la connessione.

import { useEffect, useMemo, useState } from "react"
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { AppBar } from "@/components/comuni/AppBar"
import { StatoErrore } from "@/components/stati/Stati"
import { GaraContext, type DecisioneRegistrata } from "./GaraContext"
import { AvvisoPrezzario, Stepper, TestataGara } from "./Testata"
import { Assistente } from "./Assistente"
import { useDettaglioGara, useOutput, useRegistraDecisione, useRunLog } from "@/hooks/useGaraDati"
import { useStreamGara, type StatoStream } from "@/hooks/useStreamGara"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { quandoRelativo } from "@/lib/formato"
import type { Decisione } from "@/lib/md"
import { cn } from "@/lib/utils"
import { faseCorrente } from "@/dominio/fasi"

const BADGE: Record<StatoStream, { classe: string; punto: string; testo: string }> = {
  connesso: { classe: "text-foreground-2", punto: "bg-status-ok", testo: "In tempo reale" },
  connessione: { classe: "text-muted-foreground", punto: "bg-status-neu animate-pulsa", testo: "Connessione" },
  perso: { classe: "text-status-attn", punto: "bg-status-attn", testo: "Aggiornamenti interrotti" },
}

function BadgeStream({ stato, ultimoEvento, riconnetti }: { stato: StatoStream; ultimoEvento: string | null; riconnetti: () => void }) {
  const b = BADGE[stato]
  return (
    <button type="button" onClick={riconnetti} aria-live="polite" title={ultimoEvento ? `Ultimo evento ${quandoRelativo(ultimoEvento)}. Clicca per riconnettere.` : "Clicca per riconnettere"}
      className={cn("inline-flex h-7 items-center gap-2 rounded-md px-2 text-xs transition-colors duration-(--d-fast) hover:bg-muted", b.classe)}>
      <i className={cn("size-1.5 rounded-full", b.punto)} aria-hidden="true" />
      {b.testo}
    </button>
  )
}

/** I vecchi indirizzi #/fase/5/proposta/P-07, #/grafo/gap, #/attivita
    diventano percorsi: i segnalibri continuano a funzionare. */
function percorsoDaHash(hash: string): string | null {
  const parti = hash.replace(/^#\/?/, "").split("/").filter(Boolean)
  if (!parti.length) return null
  if (parti[0] === "fase") {
    const n = Number(parti[1])
    if (!(n >= 1 && n <= 7)) return null
    const sub = parti[2] === "proposta" || parti[2] === "deliverable" ? `/${parti[2]}/${parti[3] || ""}` : ""
    return `fase/${n}${sub}`
  }
  if (parti[0] === "grafo") return `grafo${parti[1] && parti[1] !== "tutti" ? `?filtro=${parti[1]}` : ""}${parti[2] ? `${parti[1] && parti[1] !== "tutti" ? "&" : "?"}fase=${parti[2]}` : ""}`
  if (["attivita", "impostazioni", "brief"].includes(parti[0])) return parti[0]
  return null
}

export function GaraPage() {
  const { slug = "" } = useParams()
  const dettaglio = useDettaglioGara(slug)
  const output = useOutput(slug)
  const runLog = useRunLog(slug)
  const stream = useStreamGara(slug, dettaglio.isSuccess)
  const r = risorsa(dettaglio, { percorso: `/gare/${slug}` })
  const registra = useRegistraDecisione(slug)
  const [decisioni, setDecisioni] = useState<Record<string, Decisione>>({})
  const [storicoDecisioni, setStorico] = useState<DecisioneRegistrata[]>([])
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const p = percorsoDaHash(location.hash)
    if (p) navigate(p, { replace: true })
  }, [location.hash, navigate])

  useEffect(() => {
    document.title = `${dettaglio.data?.manifest.nome || slug}, Prometheus - S.P.A.D.A.`
  }, [dettaglio.data?.manifest.nome, slug])

  const ctx = useMemo(() => {
    if (!dettaglio.data) return null
    return {
      slug,
      gara: dettaglio.data,
      output: output.data || [],
      runs: runLog.data?.runs,
      stream,
      decisioni,
      storicoDecisioni,
      // Decisione ottimistica: una spunta che resta dopo un errore è peggio di nessuna spunta.
      decidi: (id: string, decisione: Decisione, nota?: string | null) => {
        const precedente = decisioni[id]
        setDecisioni((d) => ({ ...d, [id]: decisione }))
        registra.mutate({ id, decisione, nota }, {
          onSuccess: () => {
            setStorico((s) => [...s, { riferimento: id, decisione, nota: nota || null, quando: new Date().toISOString() }])
            toast.success(`${id}: decisione registrata.`)
          },
          onError: (e) => {
            setDecisioni((d) => { const n = { ...d }; if (precedente) n[id] = precedente; else delete n[id]; return n })
            toast.error("Decisione non registrata", { description: comeApiError(e).message })
          },
        })
      },
    }
  }, [slug, dettaglio.data, output.data, runLog.data, stream, decisioni, storicoDecisioni, registra])

  if (r.stato === "caricamento" || !ctx) {
    return (
      <>
        <AppBar sezione={slug} briciole={[{ a: "/", etichetta: "Gare" }, { etichetta: slug, mono: true }]} />
        {r.stato === "caricamento" ? (
          <main className="mx-auto max-w-[1280px] px-6 pt-6 pb-24" aria-busy="true" aria-label="Caricamento della gara">
            <Skeleton className="mb-2 h-5 w-48 rounded-sm" />
            <Skeleton className="mb-2 h-6 w-[60%]" />
            <Skeleton className="mb-6 h-3.5 w-[80%]" />
            <div className="mb-5 grid grid-cols-8 gap-2 border-b pb-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
            <Skeleton className="h-40" />
          </main>
        ) : (
          <main className="mx-auto max-w-[1280px] px-6 pt-6 pb-24">
            {r.errore && (
              <StatoErrore titolo="Non riesco a caricare questa gara" errore={r.errore} percorso={`/gare/${slug}`} nota="I dati della gara non sono stati modificati: nessun job è stato avviato o interrotto." onRiprova={r.riprova} inCorso={dettaglio.isFetching} />
            )}
            <Button variant="outline" className="mt-4" asChild><Link to="/">Torna all'elenco delle gare</Link></Button>
          </main>
        )}
      </>
    )
  }

  return (
    <GaraContext.Provider value={ctx}>
      <AppBar sezione={slug} briciole={[{ a: "/", etichetta: "Gare" }, { etichetta: slug, mono: true }]} badge={<BadgeStream {...stream} />} />
      <main id="contenuto" className="mx-auto max-w-[1280px] px-6 pt-6 pb-24">
        <TestataGara />
        <AvvisoPrezzario />
        <Stepper />
        <div key={location.pathname} className="animate-apparizione">
          <Outlet />
        </div>
      </main>
      <Assistente />
    </GaraContext.Provider>
  )
}

/** La pagina si apre sulla prima fase non completata. */
export function RedirectFaseCorrente() {
  const { slug = "" } = useParams()
  const dettaglio = useDettaglioGara(slug)
  if (!dettaglio.data) return null
  return <Navigate to={`/gara/${slug}/fase/${faseCorrente(dettaglio.data.fasi)}`} replace />
}
