import { Navigate, useParams } from "react-router"
import { TestataVista } from "./TestataVista"
import { useGara } from "./GaraContext"
import { Fase1 } from "./viste/Fase1"
import { Fase2 } from "./viste/Fase2"
import { Fase3 } from "./viste/Fase3"
import { Fase4 } from "./viste/Fase4"
import { Fase5 } from "./viste/Fase5"
import { Fase6Elenco } from "./viste/Fase6"
import { Fase7Elenco } from "./viste/Fase7"
import { Fase8 } from "./viste/Fase8"
import { STATO, consultabile, fase, faseCorrente, statoFase } from "@/dominio/fasi"

const VISTE: Record<number, () => React.ReactNode> = { 1: Fase1, 2: Fase2, 3: Fase3, 4: Fase4, 5: Fase5, 6: Fase6Elenco, 7: Fase7Elenco, 8: Fase8 }

export function VistaFase() {
  const { slug, gara } = useGara()
  const { n: nParam } = useParams()
  const n = Number(nParam)
  if (!(n >= 1 && n <= 8)) return <Navigate to={`/gara/${slug}`} replace />
  // Una fase ancora chiusa non si apre nemmeno da URL: si torna a quella su cui si sta lavorando.
  if (!consultabile(gara.fasi, n)) return <Navigate to={`/gara/${slug}/fase/${faseCorrente(gara.fasi)}`} replace />
  const f = fase(n)
  const st = statoFase(gara.fasi, n)
  const Vista = VISTE[n]
  return (
    <>
      <TestataVista kicker={f.kicker} titolo={f.testata} sottotitolo={f.sottotitolo} badge={{ tono: STATO[st].tono, etichetta: STATO[st].etichetta, pulsa: st === "in_esecuzione" }} />
      <Vista />
    </>
  )
}
