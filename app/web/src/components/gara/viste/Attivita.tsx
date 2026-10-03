import { useState } from "react"
import { CaretRightIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Card, Nota, Scheletro, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { Composer, Messaggi, type Messaggio } from "@/components/comuni/Chat"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato } from "@/components/gare/BadgeStato"
import { TestataVista } from "../TestataVista"
import { useGara } from "../GaraContext"
import { useCronologiaInterventi, useIntervieni, useRunLog } from "@/hooks/useGaraDati"
import { quandoBreve, quandoRelativo } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import { fase } from "@/dominio/fasi"

function AgentiAttivi() {
  const { gara, stream } = useGara()
  const att = gara.attivita
  const attivi = att.agenti_attivi || []
  const conclusi = (att.agenti_conclusi || []).slice(-8).reverse()
  if (!attivi.length && !conclusi.length) return null
  const perso = stream.stato === "perso"
  const righe = [...attivi.map((a) => ({ ...a, st: "in_corso" })), ...conclusi.map((a) => ({ ...a, st: a.stato === "interrotto" ? "errore" : "completato" }))]
  return (
    <Card>
      <TitoloSezione azioni={att.aggiornato_il ? <span className="text-micro text-muted-foreground">aggiornato {quandoRelativo(att.aggiornato_il)}</span> : undefined}>Agenti</TitoloSezione>
      {perso && (
        <Nota tono="attn" role="alert" className="mb-3" titolo="Aggiornamenti in tempo reale interrotti" azioni={<><Button size="sm" variant="outline" onClick={stream.riconnetti}>Riconnetti ora</Button><Button size="sm" variant="ghost" onClick={() => location.reload()}>Ricarica la pagina</Button></>}>
          La pipeline continua a girare sul server. Riconnessione automatica in corso, ultimo dato ricevuto {quandoRelativo(stream.ultimoEvento)}.
        </Nota>
      )}
      <div className={cn("space-y-1.5", perso && "opacity-60 saturate-50")}>
        {righe.map((a, i) => (
          <div key={i} className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-xs", perso && "border-dashed")}>
            <i className={cn("size-1.5 shrink-0 rounded-full", a.st === "in_corso" ? "bg-status-run animate-pulsa" : a.st === "errore" ? "bg-status-crit" : "bg-status-ok")} aria-hidden="true" />
            <div className="min-w-0 flex-1"><div className="font-mono font-medium">{String(a.agente || "agente")}</div>{a.descrizione ? <div className="text-foreground-2">{String(a.descrizione)}</div> : null}</div>
            <span className="text-micro text-muted-foreground">{perso ? "stato non aggiornato" : a.st === "in_corso" ? "in corso" : a.st === "errore" ? "interrotto" : "concluso"}</span>
          </div>
        ))}
      </div>
      {perso && <p className="mt-2 text-micro text-muted-foreground">Le righe restano visibili ma attenuate e tratteggiate: si distingue «fermo» da «non più aggiornato».</p>}
    </Card>
  )
}

/** Claude Code: l'unico punto dell'app che scrive sulla gara, messo accanto
    al registro di ciò che ha scritto. */
function PannelloClaudeCode() {
  const { slug } = useGara()
  const cronologia = useCronologiaInterventi(slug)
  const intervieni = useIntervieni(slug)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviato, setInviato] = useState<Messaggio | null>(null)
  const messaggi: Messaggio[] = (cronologia.data || []).map((m) => ({ mio: m.ruolo === "utente", testo: m.testo, quando: m.creato_il }))
  if (inviato) messaggi.push(inviato)
  const invia = (q: string) => {
    setErrore(null); setInviato({ mio: true, testo: q, quando: new Date().toISOString() })
    intervieni.mutate(q, {
      onSuccess: () => setInviato(null),
      onError: (e) => { setInviato(null); const err = comeApiError(e); setErrore(err.stato === 409 ? err.message : `Intervento non riuscito (${err.stato || "nessuna risposta"}). Controlla lo storico qui sopra prima di riprovare: potrebbe essere stato applicato in parte.`) },
    })
  }
  return (
    <Card tono="run" aria-labelledby="h-code">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2"><h3 id="h-code" className="text-sm font-semibold">Claude Code, intervento diretto</h3><BadgeStato tono="run">lettura e scrittura</BadgeStato></div>
          <p className="text-xs text-foreground-2">Sta qui, e non nell'assistente, perché scrive: corregge elaborati, riaccoda job, cambia parametri. La sessione è limitata alla cartella di questa gara e ogni intervento resta nello storico.</p>
        </div>
        <span className="font-mono text-micro text-muted-foreground">cwd: gare/{slug}</span>
      </div>
      <Messaggi className="mb-3 max-h-[440px] overflow-y-auto" messaggi={messaggi} chi="Claude Code" pensa={intervieni.isPending} errore={errore}
        vuoto={<><b className="font-medium text-foreground">Nessun intervento ancora.</b> Da qui si chiede una correzione puntuale che non rientra nel comando di una fase: sistemare un elaborato, rilanciare un controllo, verificare qualcosa direttamente sui documenti.</>} />
      <Composer onInvia={invia} disabilitato={intervieni.isPending} mono placeholder="Es. sostituisci la voce E.14.20 con E.14.18 nel computo e riaccoda il job" etichetta="Richiesta a Claude Code" bottone={intervieni.isPending ? "In corso" : "Esegui"} />
    </Card>
  )
}

export function Attivita() {
  const { slug, gara } = useGara()
  const q = useRunLog(slug)
  const r = risorsa(q, { vuoto: (d) => d.runs.length === 0, percorso: `/gare/${slug}/run-log` })
  const [filtro, setFiltro] = useState<"tutte" | "errori" | "umane">("tutte")
  const [grezzo, setGrezzo] = useState(false)
  const runs = (q.data?.runs || []).filter((x) => filtro === "errori" ? x.esito !== "completato" : filtro === "umane" ? x.umana : true)
  return (
    <>
      <TestataVista kicker="Vista trasversale" titolo="Attività della gara" sottotitolo="Storico delle esecuzioni, agenti al lavoro, log grezzo e canale operativo: l'unico punto dell'app che scrive sulla gara, accanto al registro di ciò che ha scritto." badge={{ tono: "neu", etichetta: "Sempre disponibile" }} />
      <div className="space-y-4">
        <Card>
          <TitoloSezione azioni={
            <div role="group" aria-label="Filtro" className="flex gap-1.5">
              {([["tutte", "Tutte le fasi"], ["errori", "Solo errori"], ["umane", "Solo decisioni umane"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={cn("h-7 rounded-md border px-2.5 text-xs transition-colors duration-(--d-fast)", filtro === k ? "border-foreground bg-foreground text-background" : "bg-card text-foreground-2 hover:bg-muted")}>{l}</button>
              ))}
            </div>
          }>Storico esecuzioni</TitoloSezione>
          {r.stato === "caricamento" && <Scheletro righe={4} className="border-0 p-0" />}
          {r.stato === "errore" && r.errore && <StatoErrore titolo="Storico non leggibile" errore={r.errore} percorso={`/gare/${slug}/run-log`} onRiprova={r.riprova} />}
          {r.stato === "vuoto" && <VuotoInline titolo="Nessuna esecuzione registrata" testo="Lo storico si popola alla prima esecuzione di una fase." />}
          {r.stato === "ok" && (runs.length === 0 ? <VuotoInline titolo="Nessuna riga con questo filtro" testo="Cambia filtro per vedere le altre esecuzioni." /> : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-foreground-2"><tr><th className="px-2.5 py-1.5 text-left font-medium">Avvio</th><th className="px-2.5 py-1.5 text-left font-medium">Fase</th><th className="px-2.5 py-1.5 text-left font-medium">Modello</th><th className="px-2.5 py-1.5 text-right font-medium">Durata</th><th className="px-2.5 py-1.5 text-right font-medium">Esito</th></tr></thead>
                <tbody>
                  {runs.map((x, i) => {
                    const tono = x.esito === "completato" ? "ok" : x.esito === "in_corso" ? "run" : "crit"
                    const fallito = x.esito !== "completato" && x.esito !== "in_corso"
                    return (
                      <tr key={i} className="border-t align-top">
                        <td className="whitespace-nowrap px-2.5 py-1.5 font-mono">{quandoBreve(x.avviato_il)}</td>
                        <td className="px-2.5 py-1.5">{x.fase}, {fase(Number(x.fase))?.titolo || ""}{fallito && <div className="mt-0.5 text-status-crit">{x.errore || "Nessun motivo registrato nel run log."}</div>}</td>
                        <td className="px-2.5 py-1.5 text-foreground-2">{x.modello || "operatore"}{x.effort ? `, ${x.effort}` : ""}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-mono">{x.durata}</td>
                        <td className="px-2.5 py-1.5 text-right"><BadgeStato tono={tono} pulsa={x.esito === "in_corso"}>{x.esito}</BadgeStato></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </Card>
        <AgentiAttivi />
        <Card className="p-0">
          <button type="button" aria-expanded={grezzo} onClick={() => setGrezzo((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs text-foreground-2 hover:text-foreground">
            <CaretRightIcon size={12} className={cn("transition-transform duration-(--d-base)", grezzo && "rotate-90")} aria-hidden="true" />Log grezzo, JSON: sede unica, non ripetuto nelle viste di fase
          </button>
          {grezzo && <pre className="max-h-96 overflow-auto border-t px-4 py-3 font-mono text-micro text-foreground-2">{JSON.stringify({ fasi: gara.fasi, attivita: gara.attivita, run_log: q.data?.grezzo ?? null }, null, 2)}</pre>}
        </Card>
        <PannelloClaudeCode />
      </div>
    </>
  )
}
