import { useEffect, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { CaretRightIcon, FileTextIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { PannelloFase } from "../PannelloFase"
import { useGara } from "../GaraContext"
import { useCreaPropostaOperatore, useGap, useProposteOperatore } from "@/hooks/useGaraDati"
import { plurale, quandoRelativo } from "@/lib/formato"
import { comeApiError, risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import type { Gap, Prova } from "@/dominio/registri"
import type { Tono } from "@/dominio/fasi"

export const TONO_SEV: Record<string, Tono> = { alta: "crit", media: "attn", bassa: "ok" }
export const ETICHETTA_SEV: Record<string, string> = { alta: "Severità alta", media: "Severità media", bassa: "Severità bassa" }

export function Prove({ prove, vuoto }: { prove: Prova[]; vuoto: string }) {
  if (!prove.length) return <p className="text-xs text-muted-foreground">{vuoto}</p>
  return (
    <div className="space-y-1.5">
      {prove.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border bg-background px-3 py-2 text-xs">
          <div className="min-w-0">
            <div className="font-mono text-micro text-muted-foreground">{p.fonte || "fonte non indicata"}</div>
            <div className="text-foreground-2">{p.testo}</div>
          </div>
          <BadgeStato tono={p.contraria ? "crit" : "ok"}>{p.contraria ? "contraria" : "a favore"}</BadgeStato>
        </div>
      ))}
    </div>
  )
}

function CardGap({ g, aperto, onToggle }: { g: Gap; aperto: boolean; onToggle: () => void }) {
  const tono = (g.severita && TONO_SEV[g.severita]) || "neu"
  return (
    <article className={cn("rounded-lg border bg-card", aperto && "border-border-strong")}>
      <div className="flex items-start gap-2 p-3">
        <button type="button" aria-expanded={aperto} onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left">
          <CaretRightIcon size={12} className={cn("mt-1 shrink-0 text-muted-foreground transition-transform duration-(--d-base) ease-(--e-enter)", aperto && "rotate-90")} aria-hidden="true" />
          <span className="min-w-0">
            <span className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-micro text-muted-foreground">{g.id || "GAP"}</span>
              {g.severita && <BadgeStato tono={tono}>{ETICHETTA_SEV[g.severita]}</BadgeStato>}
              {g.requisito && <span className="font-mono text-micro text-muted-foreground">copre {g.requisito}</span>}
            </span>
            <span className="block text-sm font-semibold">{g.titolo || "(gap senza titolo)"}</span>
            {g.sintesi && <span className="mt-0.5 block text-xs text-foreground-2">{g.sintesi}</span>}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-micro text-muted-foreground">{plurale(g.prove.length, "prova", "prove")}</span>
          {g.proposta ? <Button size="sm" variant="outline" asChild><Link to={`../fase/6/proposta/${encodeURIComponent(g.proposta)}`}>Proposta {g.proposta}</Link></Button>
            : <Button size="sm" variant="outline" asChild><Link to="../fase/6">Vai alle proposte</Link></Button>}
        </div>
      </div>
      {aperto && (
        <div className="animate-apparizione border-t px-3 py-3">
          <h4 className="mb-2 text-xs font-semibold">Prove documentali collegate</h4>
          <Prove prove={g.prove} vuoto="Il registro non riporta prove collegate a questo gap: è un'assenza dichiarata, non un errore di lettura." />
          {g.nota && <p className="mt-2 text-micro text-muted-foreground">{g.nota}</p>}
        </div>
      )}
    </article>
  )
}

const RE_CRITERIO = /^C[0-9]+$/
const RE_GAP = /^G-C[0-9]+-[0-9]+$/

function ProposteOperatore() {
  const { slug } = useGara()
  const q = useProposteOperatore(slug)
  const crea = useCreaPropostaOperatore(slug)
  const r = risorsa(q, { vuoto: (l) => l.length === 0, percorso: `/gare/${slug}/proposte-operatore` })
  const [f, setF] = useState({ criterio: "", gap_id: "", titolo: "", descrizione: "" })
  const valido = RE_CRITERIO.test(f.criterio.trim()) && (!f.gap_id.trim() || RE_GAP.test(f.gap_id.trim())) && !!f.titolo.trim() && !!f.descrizione.trim()
  const invia = () => crea.mutate({ criterio: f.criterio.trim(), gap_id: f.gap_id.trim() || null, titolo: f.titolo.trim(), descrizione: f.descrizione.trim() }, {
    onSuccess: () => { toast.success("Proposta inviata", { description: "Verrà valutata alla prossima analisi del criterio." }); setF({ criterio: "", gap_id: "", titolo: "", descrizione: "" }) },
    onError: (e) => toast.error("Proposta non inviata", { description: comeApiError(e).message }),
  })
  return (
    <Card>
      <TitoloSezione azioni={<Chip>professionista</Chip>}>Suggerisci una proposta</TitoloSezione>
      <p className="mb-3 text-xs text-foreground-2">Valutata dal sistema insieme a quelle generate dagli agenti alla prossima analisi del criterio: entra nel gioco, non scavalca l'audit delle prove.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (valido) invia() }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1"><Label htmlFor="po-criterio">Criterio</Label><Input id="po-criterio" value={f.criterio} placeholder="es. C1" className="font-mono" onChange={(e) => setF({ ...f, criterio: e.target.value })} /><span className="text-micro text-muted-foreground">Formato Cn, es. C1, C2.</span></div>
          <div className="grid gap-1"><Label htmlFor="po-gap">Gap collegato, facoltativo</Label><Input id="po-gap" value={f.gap_id} placeholder="es. G-C1-002" className="font-mono" onChange={(e) => setF({ ...f, gap_id: e.target.value })} /></div>
        </div>
        <div className="grid gap-1"><Label htmlFor="po-titolo">Titolo</Label><Input id="po-titolo" value={f.titolo} onChange={(e) => setF({ ...f, titolo: e.target.value })} /></div>
        <div className="grid gap-1"><Label htmlFor="po-desc">Descrizione</Label><Textarea id="po-desc" rows={3} value={f.descrizione} onChange={(e) => setF({ ...f, descrizione: e.target.value })} /></div>
        <Button type="submit" disabled={!valido || crea.isPending} title={valido ? "" : "Servono criterio (Cn), titolo e descrizione."}>{crea.isPending ? "Invio in corso" : "Invia proposta"}</Button>
      </form>
      <TitoloSezione className="mt-5">Proposte suggerite</TitoloSezione>
      {r.stato === "caricamento" && <Scheletro righe={2} className="border-0 p-0" />}
      {r.stato === "vuoto" && <p className="text-xs text-muted-foreground">Nessuna proposta suggerita finora.</p>}
      {r.stato === "assente" && <p className="text-xs text-muted-foreground">Il backend in esecuzione non espone le proposte del professionista.</p>}
      {r.stato === "errore" && r.errore && <p className="text-xs text-status-crit">Elenco non leggibile: {r.errore.message}</p>}
      {r.stato === "ok" && (
        <div className="space-y-1.5">
          {(q.data || []).map((p) => {
            const valutata = p.stato === "valutata"
            const tono: Tono = !valutata ? "run" : p.esito_audit === "scartata" ? "crit" : "ok"
            return (
              <div key={p.id} className="grid grid-cols-[52px_1fr_auto] gap-3 rounded-md border px-3 py-2">
                <span className="font-mono text-xs text-foreground-2">{p.criterio}</span>
                <div className="min-w-0">
                  <div className="text-sm">{p.titolo}</div>
                  {p.descrizione && <div className="text-xs text-foreground-2">{p.descrizione}</div>}
                  <div className="mt-0.5 flex gap-2 text-micro text-muted-foreground">{p.gap_id && <span className="inline-flex items-center gap-1 font-mono"><FileTextIcon aria-hidden="true" />{p.gap_id}</span>}{p.creato_il && <span>{quandoRelativo(p.creato_il)}</span>}</div>
                </div>
                <BadgeStato tono={tono}>{valutata ? (p.esito_audit || "valutata") : "in attesa di analisi"}</BadgeStato>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function Fase5() {
  const { slug } = useGara()
  const gap = useGap(slug)
  const r = risorsa(gap, { vuoto: (d) => !d || d.length === 0, percorso: "06_registers/gap_register.md" })
  const [aperto, setAperto] = useState<string | null | undefined>(undefined)
  // Il primo gap grave si apre da solo: le prove sono il motivo per cui
  // questa vista esiste, e un elenco tutto chiuso le nasconde.
  useEffect(() => {
    if (aperto === undefined && gap.data?.length) setAperto((gap.data.find((g) => g.severita === "alta") || gap.data[0]).id)
  }, [gap.data, aperto])

  return (
    <Split aside={<PannelloFase n={5} />}>
      {r.stato === "caricamento" && <Scheletro righe={5} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Registro dei gap non leggibile" errore={r.errore} percorso="06_registers/gap_register.md" onRiprova={r.riprova} />}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Nessun gap registrato" testo="Il registro dei gap si popola in Fase 5. Un gap è un requisito che l'offerta non copre ancora in modo dimostrabile. L'azione per questa fase è nel pannello a destra." /></Card>}
      {r.stato === "ok" && gap.data && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[70ch] text-sm text-foreground-2">Un <b className="font-semibold text-foreground">gap</b> è un requisito che l'offerta non copre ancora in modo dimostrabile. Espandi per vedere le prove documentali raccolte dagli agenti.</p>
            <Button size="sm" variant="outline" asChild><Link to="../grafo?filtro=gap">Grafo, gap e prove collegate</Link></Button>
          </div>
          <div className="space-y-2">{gap.data.map((g) => <CardGap key={g.id || g.titolo} g={g} aperto={aperto === g.id} onToggle={() => setAperto(aperto === g.id ? null : g.id)} />)}</div>
        </Card>
      )}
      <ProposteOperatore />
    </Split>
  )
}
