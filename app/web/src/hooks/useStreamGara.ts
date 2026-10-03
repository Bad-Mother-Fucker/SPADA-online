// Lo stream SSE della gara: aperto una volta dal guscio, non dalle viste.
// Alla caduta riprova con attesa crescente, da 2 a 30 secondi, e nel
// frattempo interroga il backend ogni 15 secondi: "fermo" e "non più
// aggiornato" non devono somigliarsi.

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { Api, type DettaglioGara } from "@/lib/api"
import { chiaviGara } from "./useGaraDati"

export type StatoStream = "connessione" | "connesso" | "perso"

export function useStreamGara(slug: string, attivo = true) {
  const qc = useQueryClient()
  const [stato, setStato] = useState<StatoStream>("connessione")
  const [ultimoEvento, setUltimoEvento] = useState<string | null>(null)
  const sorgente = useRef<EventSource | null>(null)
  const tentativi = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const firmaFasi = useRef<string>("")

  const apri = useCallback(() => {
    sorgente.current?.close()
    window.clearTimeout(timer.current)
    setStato("connessione")
    const es = new EventSource(Api.streamUrl(slug))
    sorgente.current = es

    es.onopen = () => { tentativi.current = 0; setStato("connesso") }

    es.onmessage = (ev) => {
      let payload: { fasi?: unknown; attivita?: unknown }
      try { payload = JSON.parse(ev.data) } catch { return }
      setUltimoEvento(new Date().toISOString())
      setStato("connesso")
      const firma = JSON.stringify(payload.fasi ?? null)
      const cambiate = firmaFasi.current !== "" && firma !== firmaFasi.current
      firmaFasi.current = firma
      qc.setQueryData<DettaglioGara>(chiaviGara.dettaglio(slug), (vecchio) =>
        vecchio ? { ...vecchio, fasi: (payload.fasi ?? vecchio.fasi) as DettaglioGara["fasi"], attivita: (payload.attivita ?? vecchio.attivita) as DettaglioGara["attivita"] } : vecchio)
      // Un cambio di stato delle fasi può aver prodotto nuovi elaborati:
      // si rileggono output e registri, cioè tutto ciò che sta sotto la gara.
      if (cambiate) void qc.invalidateQueries({ queryKey: chiaviGara.tutto(slug) })
    }

    es.onerror = () => {
      es.close()
      sorgente.current = null
      setStato("perso")
      const attesa = Math.min(2000 * 2 ** tentativi.current, 30_000)
      tentativi.current += 1
      timer.current = window.setTimeout(apri, attesa)
    }
  }, [slug, qc])

  useEffect(() => {
    if (!attivo) return
    apri()
    return () => { sorgente.current?.close(); sorgente.current = null; window.clearTimeout(timer.current) }
  }, [apri, attivo])

  // Polling di riserva mentre lo stream è giù: la gara resta aggiornata.
  useEffect(() => {
    if (stato !== "perso") return
    const t = window.setInterval(() => { void qc.invalidateQueries({ queryKey: chiaviGara.dettaglio(slug) }) }, 15_000)
    return () => window.clearInterval(t)
  }, [stato, slug, qc])

  const riconnetti = useCallback(() => { tentativi.current = 0; apri() }, [apri])
  return { stato, ultimoEvento, riconnetti }
}
