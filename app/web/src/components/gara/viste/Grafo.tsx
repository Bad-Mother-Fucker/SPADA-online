import { Suspense, lazy, useMemo, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, Nota, Scheletro, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { TestataVista } from "../TestataVista"
import { useGara } from "../GaraContext"
import type { ArcoRete, NodoRete } from "./GrafoRete"

// vis-network pesa più di tutto il resto dell'app: si scarica solo quando si apre il grafo.
const GrafoRete = lazy(() => import("./GrafoRete").then((m) => ({ default: m.GrafoRete })))
import { useDeliverables, useGap, useGrafo } from "@/hooks/useGaraDati"
import { plurale } from "@/lib/formato"
import { risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import { FASI } from "@/dominio/fasi"

const TIPI = [
  { chiave: "documento", etichetta: "Documenti", uno: "documento", classe: "bg-foreground-2 rounded-[2px]" },
  { chiave: "requisito", etichetta: "Requisiti", uno: "requisito", classe: "bg-status-run rounded-full" },
  { chiave: "gap", etichetta: "Gap", uno: "gap", classe: "bg-status-crit rounded-[2px]" },
  { chiave: "proposta", etichetta: "Proposte", uno: "proposta", classe: "bg-primary rounded-full" },
  { chiave: "deliverable", etichetta: "Deliverable", uno: "deliverable", classe: "bg-status-ok rounded-[3px]" },
  { chiave: "altro", etichetta: "Altri nodi", uno: "nodo", classe: "bg-status-neu rounded-[2px]" },
]
// I tipi del knowledge graph non coincidono con le colonne; ciò che non
// rientra finisce in «Altri nodi» invece di sparire.
const COLONNA_PER_TIPO: Record<string, string> = { document: "documento", criterion: "requisito", proposal: "proposta" }
const FASE_PER_COLONNA: Record<string, number> = { documento: 1, requisito: 2, gap: 5, proposta: 6, deliverable: 7, altro: 2 }
const destinazione = (colonna: string, id: string) => colonna === "proposta" ? `fase/6/proposta/${encodeURIComponent(id)}` : colonna === "deliverable" ? `fase/7/deliverable/${encodeURIComponent(id)}` : `fase/${FASE_PER_COLONNA[colonna] || 2}`

export function Grafo() {
  const { slug } = useGara()
  const grafo = useGrafo(slug)
  const gap = useGap(slug)
  const del = useDeliverables(slug)
  const r = risorsa(grafo, { percorso: `/gare/${slug}/grafo` })
  const [params, setParams] = useSearchParams()
  const filtro = params.get("filtro") || "tutti"
  const faseFiltro = params.get("fase") ? Number(params.get("fase")) : null
  const navigate = useNavigate()
  const centra = useRef<(() => void) | null>(null)

  const { nodi, archi, senzaFrontmatter } = useMemo(() => {
    const ammessa = (n: number) => !faseFiltro || faseFiltro === n
    const nodi: NodoRete[] = []
    for (const n of grafo.data?.nodi || []) {
      const colonna = COLONNA_PER_TIPO[n.tipo] || "altro"
      if (!ammessa(FASE_PER_COLONNA[colonna])) continue
      nodi.push({ id: n.id, etichetta: n.etichetta || n.id, gruppo: colonna, tipoLeggibile: TIPI.find((t) => t.chiave === colonna)?.uno || "nodo", confidence: n.confidence, destinazione: destinazione(colonna, n.id) })
    }
    const collegamenti: [string, string, string][] = []
    if (ammessa(5)) for (const x of gap.data || []) {
      nodi.push({ id: x.id || "GAP", etichetta: x.titolo || "(senza titolo)", gruppo: "gap", tipoLeggibile: "gap", destinazione: destinazione("gap", x.id) })
      if (x.requisito) collegamenti.push([x.id, x.requisito, "riguarda"])
      if (x.proposta) collegamenti.push([x.id, x.proposta, "coperto da"])
    }
    if (ammessa(7)) for (const x of del.data || []) {
      nodi.push({ id: x.id, etichetta: x.nome || x.id, gruppo: "deliverable", tipoLeggibile: "deliverable", destinazione: destinazione("deliverable", x.id) })
      if (x.criterio) collegamenti.push([x.id, x.criterio, "per il criterio"])
    }
    const ids = new Set(nodi.map((n) => n.id))
    const risolvi = (rif: string) => { const x = String(rif || "").replace(/\[|\]/g, "").trim(); if (!x) return null; if (ids.has(x)) return x; const base = x.split(/[.\s,;]/)[0]; return ids.has(base) ? base : null }
    const archi: ArcoRete[] = (grafo.data?.archi || []).filter((a) => ids.has(a.da) && ids.has(a.a)).map((a) => ({ da: a.da, a: a.a, tipo: a.tipo }))
    for (const [da, verso, tipo] of collegamenti) { const t = risolvi(verso); if (t && t !== da) archi.push({ da, a: t, tipo }) }
    return { nodi, archi, senzaFrontmatter: (grafo.data?.nodi_senza_frontmatter || []).length }
  }, [grafo.data, gap.data, del.data, faseFiltro])

  const conteggi = Object.fromEntries(TIPI.map((t) => [t.chiave, nodi.filter((n) => n.gruppo === t.chiave).length]))
  const imposta = (f: string, fase: string | null) => { const p = new URLSearchParams(); if (f !== "tutti") p.set("filtro", f); if (fase) p.set("fase", fase); setParams(p, { replace: true }) }

  return (
    <>
      <TestataVista kicker="Vista trasversale" titolo="Grafo della gara" sottotitolo="Documenti, requisiti, gap, proposte e deliverable con i legami che li tengono insieme. Consultabile in qualunque momento, indipendente dalla fase corrente." badge={{ tono: "neu", etichetta: "Sempre disponibile" }} />
      {r.stato === "caricamento" && <Scheletro righe={6} />}
      {r.stato === "assente" && <Card><VuotoInline titolo="Questa vista richiede un backend più recente" testo="Il servizio non espone il grafo strutturato. I dati della gara sono intatti: riavvia l'app con ./spada riavvia per caricare il backend aggiornato." /></Card>}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Grafo non leggibile" errore={r.errore} percorso={`/gare/${slug}/grafo`} onRiprova={r.riprova} />}
      {(r.stato === "ok" || r.stato === "vuoto") && (nodi.length === 0 ? (
        <Card><VuotoInline titolo="Il grafo è ancora vuoto" testo="I nodi compaiono man mano che le fasi producono documenti, requisiti, gap, proposte e deliverable. Il grafo di conoscenza si costruisce in Fase 2." /></Card>
      ) : (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div role="group" aria-label="Filtra per tipo di nodo" className="flex flex-wrap gap-1.5">
              {[{ chiave: "tutti", etichetta: "Tutti i nodi", classe: "bg-foreground rounded-[2px]", n: nodi.length }, ...TIPI.filter((t) => conteggi[t.chiave] > 0).map((t) => ({ ...t, n: conteggi[t.chiave] }))].map((f) => (
                <button key={f.chiave} type="button" aria-pressed={filtro === f.chiave} onClick={() => imposta(f.chiave, params.get("fase"))}
                  className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors duration-(--d-fast)", filtro === f.chiave ? "border-foreground bg-foreground text-background" : "bg-card text-foreground-2 hover:bg-muted")}>
                  <span className={cn("size-2 shrink-0", f.classe, filtro === f.chiave && "bg-background")} aria-hidden="true" />{f.etichetta}<span className="font-mono text-micro opacity-70">{f.n}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => centra.current?.()}>Centra</Button>
              <Select value={params.get("fase") || "tutte"} onValueChange={(v) => imposta(filtro, v === "tutte" ? null : v)}>
                <SelectTrigger className="h-7 w-48 text-xs" aria-label="Fase"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tutte">Tutte le fasi</SelectItem>{FASI.map((f) => <SelectItem key={f.n} value={String(f.n)}>{f.n}, {f.titolo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {senzaFrontmatter > 0 && <Nota tono="attn" className="mb-3">{plurale(senzaFrontmatter, "pagina del grafo è inclusa", "pagine del grafo sono incluse")} senza frontmatter valido: compaiono come nodo senza dati invece di essere scartate in silenzio.</Nota>}
          {archi.length === 0 && <Nota tono="run" className="mb-3">Per ora ci sono solo i nodi, senza collegamenti: gli archi tra documenti, criteri e proposte li costruisce la Fase 2, che scrive il knowledge graph.</Nota>}
          <Suspense fallback={<Skeleton className="h-[560px] w-full rounded-lg" aria-busy="true" aria-label="Caricamento del grafo" />}>
            <GrafoRete nodi={nodi} archi={archi} filtro={filtro} onApri={(dest) => navigate(`/gara/${slug}/${dest}`)} centraRef={centra} />
          </Suspense>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-micro text-muted-foreground">
            <p className="max-w-[76ch]">Trascina per spostarti, rotella per lo zoom, passa su un nodo per i dettagli. Clic su un nodo per vederne i collegamenti, doppio clic per aprirlo nella sua fase.</p>
            <span>{plurale(nodi.length, "nodo", "nodi")}, {plurale(archi.length, "arco", "archi")}, filtro: <b className="font-medium text-foreground-2">{filtro === "tutti" ? "tutti i tipi di nodo" : filtro}</b></span>
          </div>
        </Card>
      ))}
    </>
  )
}
