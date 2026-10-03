// Pannello laterale con lo stato della fase, le sue azioni e i suoi
// elaborati: presente in ogni vista di fase, sempre nello stesso posto.

import type { ReactNode } from "react"
import { ArrowSquareOutIcon } from "@phosphor-icons/react"
import { Card, Kv, Nota, TitoloSezione } from "@/components/comuni/Primitivi"
import { AzioniFase, type AzionePrimaria } from "./AzioniFase"
import { useGara } from "./GaraContext"
import { Api } from "@/lib/api"
import { quandoBreve } from "@/lib/formato"
import { STATO, corpoFase, statoFase } from "@/dominio/fasi"
import { elaboratiDiFase, erroreUltimoRun } from "@/dominio/registri"

export function PannelloFase({ n, prima, blocco, azionePrimaria }: { n: number; prima?: ReactNode; blocco?: string | null; azionePrimaria?: AzionePrimaria }) {
  const { slug, gara, output, runs } = useGara()
  const st = statoFase(gara.fasi, n)
  const meta = STATO[st]
  const corpo = corpoFase(gara.fasi, n) || {}
  const elaborati = elaboratiDiFase(output, n)
  const causa = st === "errore" ? erroreUltimoRun(runs, n) : null

  return (
    <>
      {prima}
      <Card tono={meta.tono}>
        <h3 className="mb-2 text-sm font-semibold">Fase {n}, {meta.etichetta.toLowerCase()}</h3>
        {typeof corpo.sintesi === "string" && corpo.sintesi && <p className="mb-3 text-xs text-foreground-2">{corpo.sintesi}</p>}
        {causa && <Nota tono="crit" titolo="Perché è fallita" role="alert" className="mb-3">{causa}</Nota>}
        <Kv className="mb-4" voci={[
          corpo.iniziata_il ? ["Avviata", quandoBreve(corpo.iniziata_il)] : null,
          corpo.conclusa_il ? ["Conclusa", quandoBreve(corpo.conclusa_il)] : null,
          ["Modello", gara.manifest.esecuzione?.modello || "non indicato", true],
          ["Effort", gara.manifest.esecuzione?.effort || "non indicato", true],
        ]} />
        <AzioniFase n={n} blocco={blocco} azionePrimaria={azionePrimaria} />
      </Card>
      {elaborati.length > 0 && (
        <Card>
          <TitoloSezione>Elaborati di questa fase</TitoloSezione>
          <ul className="space-y-1">
            {elaborati.map((f) => (
              <li key={f.href}>
                <a href={Api.percorsoOutput(slug, f.href)} target="_blank" rel="noopener" className="group flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors duration-(--d-fast) hover:bg-muted">
                  <span className="min-w-0 truncate text-foreground-2 group-hover:text-foreground">{f.nome}</span>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-micro text-muted-foreground">{f.ext}<ArrowSquareOutIcon aria-hidden="true" /></span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
