// Il knowledge graph come rete interattiva (vis-network). La rete sopravvive
// ai ridisegni: si ricostruisce solo quando cambiano nodi, archi o tema; il
// filtro per tipo si applica in posto, così zoom e selezione non si perdono.

import { useEffect, useMemo, useRef, useState } from "react"
import { XIcon } from "@phosphor-icons/react"
import { DataSet } from "vis-data"
import { Network } from "vis-network"
import { Button } from "@/components/ui/button"
import { useTema } from "@/hooks/useTema"
import { cn } from "@/lib/utils"

export interface NodoRete { id: string; etichetta: string; gruppo: string; tipoLeggibile: string; confidence?: string; destinazione?: string }
export interface ArcoRete { da: string; a: string; tipo?: string }

const STILE: Record<string, { token: string; forma: string }> = {
  documento: { token: "--foreground-2", forma: "square" },
  requisito: { token: "--status-run", forma: "dot" },
  gap: { token: "--status-crit", forma: "triangle" },
  proposta: { token: "--primary", forma: "dot" },
  deliverable: { token: "--status-ok", forma: "diamond" },
  altro: { token: "--status-neu", forma: "dot" },
}
const tronca = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

/** I token sono in oklch, che vis-network non sa interpretare: li converte il browser, dipingendoli su un canvas da un pixel. */
function usaConvertitore() {
  const tela = useMemo(() => document.createElement("canvas").getContext("2d", { willReadFrequently: true }), [])
  return (nome: string, alpha?: number) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
    if (!v || !tela) return "#888"
    tela.clearRect(0, 0, 1, 1); tela.fillStyle = "#000"; tela.fillStyle = v; tela.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = tela.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${(alpha ?? a / 255).toFixed(2)})`
  }
}

export function GrafoRete({ nodi, archi, filtro, onApri, centraRef }: { nodi: NodoRete[]; archi: ArcoRete[]; filtro: string; onApri: (dest: string) => void; centraRef?: React.MutableRefObject<(() => void) | null> }) {
  const tela = useRef<HTMLDivElement>(null)
  const rete = useRef<Network | null>(null)
  const dsNodi = useRef<DataSet<Record<string, unknown>> | null>(null)
  const [selezionato, setSelezionato] = useState<string | null>(null)
  const { effettivo } = useTema()
  const token = usaConvertitore()
  const indice = useMemo(() => new Map(nodi.map((n) => [n.id, n])), [nodi])
  const firma = useMemo(() => JSON.stringify([effettivo, nodi.map((n) => [n.id, n.gruppo, n.etichetta]), archi.map((a) => [a.da, a.a, a.tipo])]), [effettivo, nodi, archi])

  useEffect(() => {
    if (!tela.current) return
    const grado = new Map<string, number>()
    for (const a of archi) { grado.set(a.da, (grado.get(a.da) || 0) + 1); grado.set(a.a, (grado.get(a.a) || 0) + 1) }
    const inchiostro = token("--foreground")
    const sfondo = token("--background")
    const filo = token("--muted-foreground", 0.35)
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "system-ui"
    const ds = new DataSet(nodi.map((n) => {
      const st = STILE[n.gruppo] || STILE.altro
      const colore = token(st.token)
      const g = grado.get(n.id) || 0
      const etichetta = n.gruppo === "documento" ? n.id.split("_")[0] : n.gruppo === "requisito" && n.etichetta && n.etichetta !== n.id ? `${n.id}, ${tronca(n.etichetta, 24)}` : tronca(n.id, 24)
      return {
        id: n.id, gruppo: n.gruppo, label: etichetta, shape: st.forma, value: g + 1,
        color: { background: colore, border: colore, highlight: { background: colore, border: inchiostro }, hover: { background: colore, border: inchiostro } },
        font: { color: inchiostro, face: font, strokeWidth: 3, strokeColor: sfondo },
        title: `${n.id}${n.etichetta && n.etichetta !== n.id ? `, ${n.etichetta}` : ""}\n${n.tipoLeggibile}${n.confidence && n.confidence !== "TBD" ? `, confidence ${n.confidence}` : ""}\n${g} collegamenti`,
        hidden: filtro !== "tutti" && n.gruppo !== filtro,
      }
    }))
    const dsArchi = new DataSet(archi.map((a, i) => ({
      id: `e${i}`, from: a.da, to: a.a, title: a.tipo || "", arrows: { to: { enabled: true, scaleFactor: 0.35 } },
      color: { color: filo, highlight: token("--primary"), hover: token("--primary") }, width: 0.8, hoverWidth: 1.2, selectionWidth: 1.6, smooth: { type: "continuous" },
    })))
    dsNodi.current = ds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = new Network(tela.current, { nodes: ds as any, edges: dsArchi as any }, {
      autoResize: true,
      layout: { improvedLayout: nodi.length < 150 },
      physics: { solver: "forceAtlas2Based", forceAtlas2Based: { gravitationalConstant: -120, centralGravity: 0.012, springLength: 170, springConstant: 0.05, avoidOverlap: 0.7 }, stabilization: { iterations: 250, fit: true }, maxVelocity: 40 },
      interaction: { hover: true, tooltipDelay: 160, hideEdgesOnDrag: archi.length > 400, multiselect: false, navigationButtons: false },
      nodes: { borderWidth: 1.5, shadow: false, scaling: { min: 6, max: 30, label: { enabled: true, min: 12, max: 18, maxVisible: 24, drawThreshold: 4 } } },
      edges: { selectionWidth: 2 },
    })
    r.once("stabilizationIterationsDone", () => r.setOptions({ physics: { enabled: false } }))
    r.on("click", (e: { nodes: string[] }) => setSelezionato(e.nodes[0] || null))
    r.on("doubleClick", (e: { nodes: string[] }) => { const n = indice.get(e.nodes[0]); if (n?.destinazione) onApri(n.destinazione) })
    rete.current = r
    if (centraRef) centraRef.current = () => r.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } })
    return () => { r.destroy(); rete.current = null; if (centraRef) centraRef.current = null }
    // La rete si ricostruisce solo quando cambia la firma, non a ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  useEffect(() => {
    dsNodi.current?.update(nodi.map((n) => ({ id: n.id, hidden: filtro !== "tutti" && n.gruppo !== filtro })))
  }, [filtro, nodi])

  const n = selezionato ? indice.get(selezionato) : null
  const vicini = n ? archi.flatMap((a) => a.da === n.id && indice.has(a.a) ? [{ id: a.a, tipo: a.tipo, verso: "→" }] : a.a === n.id && indice.has(a.da) ? [{ id: a.da, tipo: a.tipo, verso: "←" }] : []) : []

  return (
    <div className="relative">
      <div ref={tela} className="h-[560px] w-full rounded-md border bg-background" />
      <aside className={cn("absolute right-3 top-3 w-72 rounded-lg border bg-card p-3 text-xs shadow-pop animate-apparizione", !n && "hidden")} aria-live="polite">
        {n && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-micro text-muted-foreground">{n.tipoLeggibile}</div><strong className="font-mono text-sm">{n.id}</strong></div>
              <Button variant="ghost" size="icon-xs" aria-label="Chiudi" onClick={() => { rete.current?.unselectAll(); setSelezionato(null) }}><XIcon aria-hidden="true" /></Button>
            </div>
            {n.etichetta && n.etichetta !== n.id && <p className="mt-1 text-foreground-2">{n.etichetta}</p>}
            {n.confidence && n.confidence !== "TBD" && <p className="mt-1 text-micro text-muted-foreground">confidence: {n.confidence}</p>}
            <div className="mt-2 border-t pt-2 text-micro text-muted-foreground">{vicini.length ? `${vicini.length} collegamenti` : "Nessun collegamento"}</div>
            {vicini.length > 0 && (
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                {vicini.slice(0, 14).map((v, i) => (
                  <li key={i}><button type="button" className="w-full rounded-sm px-1 py-0.5 text-left hover:bg-muted" onClick={() => { rete.current?.selectNodes([v.id]); rete.current?.focus(v.id, { scale: 1.1, animation: { duration: 400, easingFunction: "easeInOutQuad" } }); setSelezionato(v.id) }}><span className="font-mono">{v.verso} {v.id}</span>{v.tipo && <span className="text-muted-foreground">, {v.tipo}</span>}</button></li>
                ))}
              </ul>
            )}
            {n.destinazione && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onApri(n.destinazione!)}>Apri nella sua fase</Button>}
          </>
        )}
      </aside>
    </div>
  )
}
