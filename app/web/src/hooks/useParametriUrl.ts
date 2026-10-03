import { useCallback, useEffect, useState } from "react"

/** Stato della vista nell'URL (filtro, ricerca): un ricaricamento o un link
    condiviso riportano esattamente alla stessa vista. */
export function useParametriUrl<K extends string>(chiavi: readonly K[], predefiniti: Record<K, string>) {
  const leggi = useCallback((): Record<K, string> => {
    const p = new URLSearchParams(location.search)
    const out = { ...predefiniti }
    for (const k of chiavi) {
      const v = p.get(k)
      if (v !== null) out[k] = v
    }
    return out
  }, [chiavi, predefiniti])

  const [valori, setValori] = useState<Record<K, string>>(leggi)

  useEffect(() => {
    const onPop = () => setValori(leggi())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [leggi])

  const imposta = useCallback((patch: Partial<Record<K, string>>) => {
    setValori((prima) => {
      const dopo = { ...prima, ...patch }
      const p = new URLSearchParams(location.search)
      for (const k of chiavi) {
        if (dopo[k] && dopo[k] !== predefiniti[k]) p.set(k, dopo[k])
        else p.delete(k)
      }
      const q = p.toString()
      history.replaceState(null, "", q ? `${location.pathname}?${q}` : location.pathname)
      return dopo
    })
  }, [chiavi, predefiniti])

  return [valori, imposta] as const
}
