import { useMemo, useState } from "react"
import { FilesIcon, MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AppBar } from "@/components/comuni/AppBar"
import { AvvisoStantio, StatoErrore, StatoVuoto } from "@/components/stati/Stati"
import { CardGara, ultimoMovimento } from "./CardGara"
import { FiltriGare, etichettaFiltro, type Filtro } from "./FiltriGare"
import { PannelloNuovaGara } from "./PannelloNuovaGara"
import { DialogoElimina } from "./DialogoElimina"
import { SkeletonGriglia } from "./SkeletonCard"
import { useEliminaGara, useGare } from "@/hooks/useGare"
import { useParametriUrl } from "@/hooks/useParametriUrl"
import { useRicontrollaSaluteSe } from "@/hooks/useStatoBackend"
import type { Gara } from "@/lib/api"
import { plurale, quandoRelativo } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { statoGara } from "@/dominio/fasi"

/** Prima ciò che richiede una persona, poi per ultimo aggiornamento: è la
    regola dichiarata in fondo alla pagina, non un ordinamento implicito. */
const PRIORITA: Record<string, number> = { errore: 0, da_rivedere: 1, interrotta: 2, in_esecuzione: 3, in_coda: 4, completata: 5 }

function ordinate(lista: Gara[]): Gara[] {
  return lista.slice().sort((a, b) => {
    const pa = PRIORITA[statoGara(a.fasi)] ?? 9
    const pb = PRIORITA[statoGara(b.fasi)] ?? 9
    if (pa !== pb) return pa - pb
    return Date.parse(ultimoMovimento(b) || "0") - Date.parse(ultimoMovimento(a) || "0")
  })
}

const CHIAVI_URL = ["stato", "q"] as const
const PREDEFINITI = { stato: "tutte", q: "" }

export function ElencoGare() {
  const query = useGare()
  const r = risorsa(query, { vuoto: (l) => l.length === 0, percorso: "/gare" })
  useRicontrollaSaluteSe(query.error)

  const [param, setParam] = useParametriUrl(CHIAVI_URL, PREDEFINITI)
  const filtro = (param.stato || "tutte") as Filtro
  const ricerca = param.q

  const [nuovaAperta, setNuovaAperta] = useState(false)
  const [daEliminare, setDaEliminare] = useState<Gara | null>(null)
  const elimina = useEliminaGara()

  const lista = useMemo(() => r.dati ?? [], [r.dati])
  const conteggi = useMemo(() => {
    const c: Partial<Record<Filtro, number>> = { tutte: lista.length }
    for (const g of lista) {
      const st = statoGara(g.fasi)
      c[st] = (c[st] ?? 0) + 1
    }
    return c
  }, [lista])

  const filtrate = useMemo(() => {
    const q = ricerca.trim().toLowerCase()
    return ordinate(lista.filter((g) => {
      if (filtro !== "tutte" && statoGara(g.fasi) !== filtro) return false
      if (!q) return true
      return `${g.nome || ""} ${g.slug}`.toLowerCase().includes(q)
    }))
  }, [lista, filtro, ricerca])

  const sommario = (() => {
    if (r.stato === "caricamento") return "Caricamento dell'elenco…"
    if (r.stato === "errore" || r.stato === "assente") return "Elenco non disponibile."
    const n = lista.length
    if (n === 0) return "Nessuna gara registrata."
    const daRivedere = conteggi.da_rivedere ?? 0
    const inErrore = conteggi.errore ?? 0
    const pezzi: React.ReactNode[] = [plurale(n, "gara", "gare")]
    if (daRivedere) pezzi.push(", ", <b key="r" className="font-semibold text-status-attn">{daRivedere === 1 ? "1 richiede la tua revisione" : `${daRivedere} richiedono la tua revisione`}</b>)
    if (inErrore) pezzi.push(", ", `${inErrore} in errore`)
    return pezzi
  })()

  function confermaEliminazione(g: Gara) {
    setDaEliminare(null)
    const nome = g.nome || g.slug
    elimina.mutate(g.slug, {
      onSuccess: () => toast.success(`Gara «${nome}» eliminata.`),
      onError: (e) => toast.error("Eliminazione non riuscita", { description: comeApiError(e, `/gare/${g.slug}`).message }),
    })
  }

  const filtriAttivi = filtro !== "tutte" || ricerca.trim() !== ""

  return (
    <>
      <AppBar />
      <main id="contenuto" className="mx-auto max-w-[1200px] px-6 py-6 max-md:px-4">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Gare in lavorazione</h1>
            <p className="mt-0.5 text-foreground-2" aria-live="polite">{sommario}</p>
          </div>
          <Button onClick={() => setNuovaAperta(true)}>
            <PlusIcon weight="bold" aria-hidden="true" />
            Nuova gara
          </Button>
        </header>

        <FiltriGare filtro={filtro} conteggi={conteggi} onFiltro={(f) => setParam({ stato: f })} ricerca={ricerca} onRicerca={(q) => setParam({ q })} />

        {r.stantio && r.errore && (
          <AvvisoStantio
            messaggio={`Ultimo aggiornamento riuscito ${quandoRelativo(new Date(query.dataUpdatedAt).toISOString())}. ${r.errore.message.replace(/\.?$/, ".")}`}
            onRiprova={r.riprova}
            inCorso={r.aggiornamento}
          />
        )}

        <section aria-live="polite" aria-busy={r.stato === "caricamento" || undefined}>
          {r.stato === "caricamento" && <SkeletonGriglia />}

          {(r.stato === "errore" || r.stato === "assente") && r.errore && (
            <StatoErrore
              titolo="Non riesco a caricare l'elenco delle gare"
              errore={r.errore}
              percorso="/gare"
              nota="Nessuna gara è stata modificata: non è stato avviato né interrotto alcun job."
              onRiprova={r.riprova}
              inCorso={query.isFetching}
            />
          )}

          {r.stato === "vuoto" && (
            <StatoVuoto
              icona={<FilesIcon size={20} />}
              titolo="Nessuna gara ancora registrata"
              testo="Una gara nasce da tre documenti: disciplinare, elaborati tecnici e, se presenti, i PDF firmati P7M. Il resto lo produce la pipeline."
              azioni={<Button onClick={() => setNuovaAperta(true)}>Crea la prima gara</Button>}
            />
          )}

          {r.stato === "ok" && filtrate.length === 0 && (
            <StatoVuoto
              icona={<MagnifyingGlassIcon size={20} />}
              titolo="Nessuna gara corrisponde"
              testo={
                <>
                  Nessuna gara soddisfa {filtro !== "tutte" && <>il filtro <b className="font-medium text-foreground">{etichettaFiltro(filtro)}</b></>}
                  {filtro !== "tutte" && ricerca.trim() && " e "}
                  {ricerca.trim() && <>la ricerca <b className="font-medium text-foreground">«{ricerca.trim()}»</b></>}.
                </>
              }
              azioni={filtriAttivi && <Button variant="outline" onClick={() => setParam({ stato: "tutte", q: "" })}>Azzera i filtri</Button>}
            />
          )}

          {r.stato === "ok" && filtrate.length > 0 && (
            <div className="animate-apparizione grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
              {filtrate.map((g) => (
                <CardGara key={g.slug} gara={g} onElimina={setDaEliminare} inEliminazione={elimina.isPending && elimina.variables === g.slug} />
              ))}
            </div>
          )}
        </section>

        <p className="mt-5 text-micro text-muted-foreground">
          Ordinamento: prima le gare che richiedono un'azione umana, poi per ultimo aggiornamento.
        </p>
      </main>

      <PannelloNuovaGara aperto={nuovaAperta} onApertoChange={setNuovaAperta} slugPresi={lista.map((g) => g.slug)} />
      <DialogoElimina gara={daEliminare} onChiudi={() => setDaEliminare(null)} onConferma={confermaEliminazione} />
    </>
  )
}
