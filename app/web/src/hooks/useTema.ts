import { useCallback, useEffect, useState } from "react"
import { applicaTema, leggiTema, temaEffettivo, type Tema } from "@/lib/tema"

/** Preferenza di tema (chiaro, scuro, sistema) e tema davvero in uso. */
export function useTema() {
  const [tema, setTema] = useState<Tema>(() => leggiTema())
  const [effettivo, setEffettivo] = useState<"light" | "dark">(() => temaEffettivo())

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const aggiorna = () => setEffettivo(temaEffettivo())
    mq.addEventListener("change", aggiorna)
    return () => mq.removeEventListener("change", aggiorna)
  }, [])

  const scegli = useCallback((t: Tema) => {
    applicaTema(t)
    setTema(t)
    setEffettivo(temaEffettivo())
  }, [])

  return { tema, effettivo, scegli }
}
