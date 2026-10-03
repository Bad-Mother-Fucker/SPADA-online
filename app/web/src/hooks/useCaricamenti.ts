// Caricamento dei documenti della Fase 1: un file alla volta, con
// avanzamento per file, rifiuti con motivo e, a gara avviata, le fasi già
// completate da rivalutare. Lo stato vive qui e non nella vista, così un
// upload prosegue anche se l'operatore cambia vista.

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"
import { Api } from "@/lib/api"
import { comeApiError } from "@/lib/risorsa"
import { categoriaProbabile, motivoRifiuto, type Categoria } from "@/dominio/fasi"
import { chiaviGara } from "./useGaraDati"

export interface Caricamento { nome: string; dimensione: number; categoria: Categoria; progresso: number }
export interface Rifiuto { nome: string; dimensione: number; motivo: string }

export function useCaricamenti(slug: string, onEsito?: (esito: { caricati: number; fasiDaValutare: number[] }) => void) {
  const qc = useQueryClient()
  const [inCorso, setInCorso] = useState<Caricamento[]>([])
  const [rifiutati, setRifiutati] = useState<Rifiuto[]>([])
  const coda = useRef<Promise<void>>(Promise.resolve())

  const aggiornaProgresso = (nome: string, progresso: number) =>
    setInCorso((l) => l.map((c) => (c.nome === nome ? { ...c, progresso } : c)))

  const carica = useCallback((files: File[], categoriaForzata: Categoria | null) => {
    if (!files.length) return
    const buoni: { file: File; categoria: Categoria }[] = []
    const nuoviRifiuti: Rifiuto[] = []
    for (const f of files) {
      const motivo = motivoRifiuto(f)
      if (motivo) nuoviRifiuti.push({ nome: f.name, dimensione: f.size, motivo })
      else buoni.push({ file: f, categoria: categoriaForzata || categoriaProbabile(f.name) })
    }
    if (nuoviRifiuti.length) setRifiutati((r) => [...r, ...nuoviRifiuti])
    if (!buoni.length) return
    setInCorso((l) => [...l, ...buoni.map((b) => ({ nome: b.file.name, dimensione: b.file.size, categoria: b.categoria, progresso: 0 }))])

    // Uno alla volta, in coda: il backend scrive su disco a blocchi e due
    // upload in parallelo non lo renderebbero più veloce.
    coda.current = coda.current.then(async () => {
      let caricati = 0
      let fasiDaValutare: number[] = []
      for (const { file, categoria } of buoni) {
        try {
          const r = await Api.caricaDocumento(slug, categoria, file, (fr) => aggiornaProgresso(file.name, fr))
          caricati += 1
          const fasi = (r as { fasi_completate_da_valutare?: number[] }).fasi_completate_da_valutare
          if (fasi?.length) fasiDaValutare = fasi
        } catch (e) {
          setRifiutati((r) => [...r, { nome: file.name, dimensione: file.size, motivo: comeApiError(e).message }])
        } finally {
          setInCorso((l) => l.filter((c) => c.nome !== file.name))
        }
      }
      if (caricati) void qc.invalidateQueries({ queryKey: chiaviGara.documenti(slug) })
      onEsito?.({ caricati, fasiDaValutare })
    })
  }, [slug, qc, onEsito])

  const scarta = useCallback((nome: string) => setRifiutati((r) => r.filter((x) => x.nome !== nome)), [])

  return { inCorso, rifiutati, carica, scarta }
}
