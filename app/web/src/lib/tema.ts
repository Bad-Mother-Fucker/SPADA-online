// Tema chiaro, scuro o automatico. La preferenza vive in localStorage con la
// stessa chiave del frontend precedente, così chi aveva scelto un tema lo
// ritrova. "auto" significa nessun attributo: decide prefers-color-scheme.

export type Tema = "light" | "dark" | "auto"

export const CHIAVE_TEMA = "spada.tema"

export function leggiTema(): Tema {
  try {
    const v = localStorage.getItem(CHIAVE_TEMA)
    return v === "light" || v === "dark" ? v : "auto"
  } catch {
    return "auto"
  }
}

/** Quale dei due temi è davvero in uso adesso. */
export function temaEffettivo(): "light" | "dark" {
  const v = leggiTema()
  if (v !== "auto") return v
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Applica il tema senza far animare ogni proprietà colorata (DESIGN.md §6). */
export function applicaTema(valore: Tema) {
  const r = document.documentElement
  r.setAttribute("data-theme-switching", "")
  if (valore === "auto") r.removeAttribute("data-theme")
  else r.setAttribute("data-theme", valore)
  try {
    localStorage.setItem(CHIAVE_TEMA, valore)
  } catch {
    /* storage negato: il tema vale solo per questa sessione */
  }
  void document.body.offsetHeight
  requestAnimationFrame(() => r.removeAttribute("data-theme-switching"))
}
