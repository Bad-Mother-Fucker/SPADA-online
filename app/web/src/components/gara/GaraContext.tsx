import { createContext, useContext } from "react"
import type { GaraNormalizzata } from "@/hooks/useGaraDati"
import type { StatoStream } from "@/hooks/useStreamGara"
import type { Run } from "@/dominio/registri"
import type { Decisione } from "@/lib/md"

export interface DecisioneRegistrata { riferimento: string; decisione: Decisione; nota: string | null; quando: string }

export interface GaraCtx {
  slug: string
  gara: GaraNormalizzata
  /** GET /output: noto in anticipo, i file assenti non si richiedono nemmeno. */
  output: string[]
  runs: Run[] | undefined
  stream: { stato: StatoStream; ultimoEvento: string | null; riconnetti: () => void }
  /** Decisioni prese in questa sessione: hanno la precedenza sul registro,
      che il worker riscrive solo alla prossima esecuzione. */
  decisioni: Record<string, Decisione>
  storicoDecisioni: DecisioneRegistrata[]
  decidi: (id: string, decisione: Decisione, nota?: string | null) => void
}

export const GaraContext = createContext<GaraCtx | null>(null)

export function useGara(): GaraCtx {
  const c = useContext(GaraContext)
  if (!c) throw new Error("useGara fuori dalla pagina gara")
  return c
}
